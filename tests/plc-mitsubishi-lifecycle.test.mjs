import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {assessLifecycle} from '../lib/plc-lifecycle.mjs';
import {normaliseMitsubishiModel,REVIEWED_MITSUBISHI_LIFECYCLE} from '../lib/plc-mitsubishi-lifecycle.mjs';
import {deriveSnapshotView,freeSnapshotResult} from '../lib/plc-snapshot-view.mjs';
import {validateSnapshotResult,createMockSnapshotResult} from '../lib/plc-audit-model.mjs';

const now=new Date('2026-10-08T12:00:00Z');
const base=()=>({controller:{manufacturer:'Mitsubishi Electric',configuredType:'FX3G',family:'',model:'',orderNumber:''},
  topFindings:[{id:'configured-cpu',confidence:'VERIFIED'}],project:{platform:'Mitsubishi GX Works2'},
  blockCount:1,writeCount:4,multipleWriterCount:2,supportedAreas:['Detected source write sites'],
  unsupportedAreas:['Visual rung boundaries'],engineVersion:'real-parser/test',analysisCoveragePercent:0});
const exact=model=>({...base(),controller:{...base().controller,model,orderNumber:model}});
const script=await readFile(new URL('../plc-audit.js',import.meta.url),'utf8');
function render(result){const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);return context.renderLifecycle(result);}

test('programming type gets both dated manufacturer notices without an exact CPU status',()=>{
  const s=base(),life=assessLifecycle(s,now);
  assert.equal(life.status,'UNKNOWN');assert.equal(life.orderNumber,'');
  assert.equal(life.familyNotice.kind,'PROGRAMMING_TYPE_CONTEXT');
  assert.equal(life.familyNotice.notices[0].productionEnds,'2026-12-31');
  assert.equal(life.familyNotice.notices[1].productionEnds,'2025-09-30');
  const view=deriveSnapshotView(s,{status:'REVIEW_REQUIRED',lifecycle:life});
  assert.equal(view.overall.label,'REVIEW');assert.equal(view.lifecycle.label,'REVIEW');
  assert.match(view.lifecycle.explanation,/exact CPU/);
  assert.equal(s.controller.model,'');
  const html=render(life);
  assert.match(html,/31 December 2026/);assert.match(html,/30 September 2025/);
  assert.match(html,/not an exact CPU lifecycle classification/);
  assert.match(html,/parts availability/);assert.match(html,/www.mitsubishielectric.com/);
  assert.doesNotMatch(html,/Phase-out announced from|Recheck Siemens/);
});
test('all explicitly listed Mitsubishi variants have reviewed records and exact matches',()=>{
  assert.equal(Object.keys(REVIEWED_MITSUBISHI_LIFECYCLE).length,38);
  for(const model of Object.keys(REVIEWED_MITSUBISHI_LIFECYCLE)){
    const life=assessLifecycle(exact(model),now);
    assert.equal(life.status,model.startsWith('FX3GE-')?'DISCONTINUED':'PHASE_OUT');
    assert.equal(life.orderNumber,model);assert.equal(life.familyNotice.kind,'EXACT_MODEL_SCHEDULE');
  }
});
test('exact CPU evidence drives Attention or High Priority while family context alone does not',()=>{
  for(const [model,label] of [['FX3G-40MR/ES','ATTENTION'],['FX3GE-40MR/ES','HIGH PRIORITY']]){
    const s=exact(model),life=assessLifecycle(s,now);
    assert.equal(deriveSnapshotView(s,{status:'REVIEW_REQUIRED',lifecycle:life}).overall.label,label);
    assert.match(render(life),new RegExp(model.replace('/','\\/')));
  }
});
test('unverified, mismatched and unlisted variants never acquire an exact lifecycle result',()=>{
  for(const s of [{...exact('FX3G-40MR/ES'),topFindings:[]},
    {...exact('FX3G-40MR/ES'),controller:{...exact('FX3G-40MR/ES').controller,model:'FX3G-40MT/ES'}},
    exact('FX3G-40MR/ES-UNKNOWN'),exact('FX3G-32MR/ES'),
    {...exact('FX3G-40MR/ES'),controller:{...exact('FX3G-40MR/ES').controller,manufacturer:'Other'}}]){
    assert.equal(assessLifecycle(s,now).status,'UNKNOWN');
  }
  assert.equal(normaliseMitsubishiModel('FX3G-40MR'), '');
  assert.equal(normaliseMitsubishiModel(' fx3g-40mr/es '),'FX3G-40MR/ES');
});
test('expired or future-dated reviews require recheck for exact and contextual data',()=>{
  for(const date of ['2026-10-07','2026-10-22','2027-01-01']){
    assert.equal(assessLifecycle(exact('FX3G-40MR/ES'),new Date(date)).status,'STALE');
    const context=assessLifecycle(base(),new Date(date));
    assert.equal(context.status,'UNKNOWN');assert.equal(context.familyNotice.stale,true);
    assert.equal(deriveSnapshotView(base(),{status:'REVIEW_REQUIRED',lifecycle:context}).lifecycle.label,'NOT ASSESSED');
    assert.match(render(context),/needs recheck/);
  }
});
test('unsupported programming selections and unsafe manufacturer links fail closed',()=>{
  const s=base();s.controller.configuredType='Q03UDCPU';
  assert.equal(assessLifecycle(s,now).familyNotice,null);
  assert.doesNotMatch(render({...assessLifecycle(base(),now),sources:[{title:'Bad',url:'javascript:alert(1)'},{title:'Bad',url:'https://mitsubishielectric.com.evil.example/path'}]}),/javascript:|evil.example/);
});
test('program structure is strictly typed, public scalar-only and renders with hardware qualification',()=>{
  const s=createMockSnapshotResult({id:'synthetic'});
  s.project.platform='Mitsubishi GX Works2';s.engineVersion='real-parser/test';
  s.programStructure={plcSteps:41,contactInstructions:2,timerInstructions:2,counterInstructions:1,
    setResetInstructions:2,arithmeticInstructions:1,transferInstructions:1,inputReferences:1,outputReferences:1,
    privateTargetList:['PRIVATE_ENGINEERING_TARGET']};
  assert.equal(validateSnapshotResult(s).valid,true);
  const v=deriveSnapshotView(s,{status:'REVIEW_REQUIRED'}),free=freeSnapshotResult(s,v);
  assert.equal(free.programStructure.privateTargetList,undefined);
  assert.ok(!JSON.stringify(free).includes('PRIVATE_ENGINEERING_TARGET'));
  for(const value of [null,[],{}, {...s.programStructure,timerInstructions:true}, {...s.programStructure,plcSteps:'41'}, {...s.programStructure,inputReferences:-1}]){
    assert.equal(validateSnapshotResult({...s,programStructure:value}).valid,false);
  }
  const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);
  const html=context.renderSnapshot(free,null,v);
  assert.match(html,/<b>41<\/b><span>PLC steps<\/span>/);
  assert.match(html,/not configured I\/O/);
  assert.doesNotMatch(html,/PRIVATE_ENGINEERING_TARGET/);
});
