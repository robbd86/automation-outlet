import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {deriveSnapshotView,freeSnapshotResult} from '../lib/plc-snapshot-view.mjs';
import {validateSnapshotResult} from '../lib/plc-audit-model.mjs';
import {assessLifecycle} from '../lib/plc-lifecycle.mjs';
const script=await readFile(new URL('../plc-audit.js',import.meta.url),'utf8');
function fixture(decoded=true){
  return {schemaVersion:2,project:{platform:'Mitsubishi GX Works2',engineeringSoftware:'GX Works2',projectName:'Synthetic',projectVersion:''},
    controller:{manufacturer:'Mitsubishi Electric',family:'MELSEC-F / FX3G',configuredType:'FX3G',model:'',orderNumber:'',firmware:'',safetyType:''},
    blockCount:1,networkCount:null,callCount:decoded?0:null,writeCount:decoded?3:null,multipleWriterCount:decoded?1:null,investigationCount:2,
    unassessedCounts:decoded?['networkCount']:['networkCount','callCount','writeCount','multipleWriterCount'],
    ...(decoded?{instructionCount:12,programStructure:{plcSteps:20,contactInstructions:3,timerInstructions:0,counterInstructions:0,
      setResetInstructions:0,arithmeticInstructions:0,transferInstructions:0,inputReferences:0,outputReferences:0}}:{}),
    programBreakdown:{organisationBlocks:null,functionBlocks:null,functions:null,dataBlocks:null,safetyBlocks:null},
    hardwareSummary:{configuredIoPoints:null,digitalInputs:null,digitalOutputs:null,analogueInputs:null,analogueOutputs:null,remoteIoStations:null,networkDevices:null,communications:[],ioMappingStatus:'Not assessed'},
    supportedAreas:['Supplied program-unit inventory',...(decoded?['Decoded Mitsubishi instruction inventory','Detected source write sites']:[])],
    unsupportedAreas:['Visual rung/network boundaries','Interprocedural/control-flow and live timing assessment'],
    analysisCoveragePercent:0,evidenceConfidence:'UNKNOWN',engineVersion:'real-parser/test',generatedAt:'2026-10-08T12:00:00Z',
    topFindings:[{id:'configured-cpu',title:'Configured PLC type identified',confidence:'VERIFIED',summary:'Saved type',evidence:['Synthetic record']},
      ...(decoded?[{id:'writers-1',title:'Private write target',confidence:'VERIFIED',summary:'PRIVATE_ADDRESS',evidence:['PRIVATE_ADDRESS']}]:[])],maintenanceSummary:{}};
}
function render(s,view,life=null){const ctx=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,ctx);return ctx.renderSnapshot(s,life,view);}
function present(s){const life=assessLifecycle(s,new Date('2026-10-08T12:00:00Z')),view=deriveSnapshotView(s,{status:'REVIEW_REQUIRED',lifecycle:life});return {view,life,free:freeSnapshotResult(s,view)};}

test('decoded Mitsubishi reports PARTIAL scope in findings and technical evidence without a false percentage',()=>{
  const s=fixture(),{view,free,life}=present(s),html=render(free,view,life);
  assert.equal(view.analysisScope.status,'PARTIAL');
  assert.match(view.analysisScope.explanation,/No defensible whole-project coverage denominator/);
  assert.match(view.findings.find(f=>f.id==='analysis-scope').evidenceSummary,/PARTIAL source analysis/);
  assert.match(html,/Analysis scope: <strong>PARTIAL<\/strong>/);
  assert.doesNotMatch(html,/0%|supported analysis coverage|Supported analysis coverage/);
  assert.equal(s.analysisCoveragePercent,0,'stored legacy schema field remains untouched');
  assert.doesNotMatch(html,/PRIVATE_ADDRESS|Private write target/);
});

test('inventory-only Mitsubishi reports LIMITED scope and all unsupported counts as unassessed',()=>{
  const {view,free}=present(fixture(false)),html=render(free,view);
  assert.equal(view.analysisScope.status,'LIMITED');
  assert.match(html,/Analysis scope: <strong>LIMITED<\/strong>/);
  for(const label of ['Calls','Networks','Writes','Shared-write targets'])assert.ok(html.includes(`<b>—</b><span>${label}</span>`));
  assert.doesNotMatch(html,/0%/);
  assert.equal(validateSnapshotResult(free).valid,true);
});

test('legacy Calls zero becomes unassessed; positively counted zero source categories remain zero',()=>{
  const s=fixture(),{view,free}=present(s),html=render(free,view);
  assert.equal(s.callCount,0,'stored analyser evidence is unchanged');
  assert.equal(free.callCount,null);
  assert.ok(free.unassessedCounts.includes('callCount'));
  assert.equal(validateSnapshotResult(free).valid,true);
  assert.ok(html.includes('<b>—</b><span>Calls</span>'));
  assert.ok(render(s,view).includes('<b>—</b><span>Calls</span>'),'raw/older result fallback also masks Calls');
  for(const label of ['Timer instructions','Counter instructions','Input addresses referenced'])assert.ok(html.includes(`<b>0</b><span>${label}</span>`));
});

test('unperformed metrics never display historical zero placeholders; decoded writes can have assessed zero',()=>{
  const s=fixture(false);s.networkCount=s.callCount=s.writeCount=s.multipleWriterCount=0;
  s.hardwareSummary.digitalInputs=s.hardwareSummary.configuredIoPoints=0;s.programBreakdown.safetyBlocks=0;
  const {view,free}=present(s),html=render(free,view);
  for(const key of ['networkCount','callCount','writeCount','multipleWriterCount'])assert.equal(free[key],null);
  assert.equal(view.sharedControl.count,null);
  for(const label of ['Networks','Calls','Writes','Shared-write targets','Digital inputs','Configured I/O','Safety blocks'])assert.ok(!html.includes(`<b>0</b><span>${label}</span>`));
  const assessed=fixture();assessed.writeCount=assessed.multipleWriterCount=0;assessed.topFindings=assessed.topFindings.slice(0,1);
  const p=present(assessed);assert.equal(p.free.writeCount,0);assert.equal(p.free.multipleWriterCount,0);
  assert.ok(render(p.free,p.view).includes('<b>0</b><span>Writes</span>'));
  assert.equal(p.view.overall.label,'REVIEW','observed zero does not certify the whole project');
});

test('unknown Mitsubishi main unit gets label-first lifecycle guidance and no duplicate identity Top Finding',()=>{
  const s=fixture(),{view,free,life}=present(s),html=render(free,view,life);
  assert.ok(!view.findings.some(f=>f.id==='configured-plc-type'||f.title==='Configured PLC type identified'));
  assert.ok(view.recoveryChecks.some(c=>c.label==='Configured PLC type identified'&&c.status==='CONFIRMED'));
  assert.match(html,/Configured PLC type/);assert.match(html,/FX3G/);
  const finding=view.findings.find(f=>f.id==='lifecycle-review');
  assert.match(finding.nextStep,/from the installed PLC label first, then verify manufacturer lifecycle and availability/);
  assert.doesNotMatch(html,/this exact order number|for the exact order number/);
  const stale=assessLifecycle(s,new Date('2026-10-22'));
  const staleView=deriveSnapshotView(s,{status:'REVIEW_REQUIRED',lifecycle:stale});
  const staleHtml=render(freeSnapshotResult(s,staleView),staleView,stale);
  assert.match(staleHtml,/PLC label first, then verify manufacturer lifecycle and availability/);
  assert.doesNotMatch(staleHtml,/this exact order number|for the exact order number/);
});

test('technical unknown fields display an em dash without escaped entity text',()=>{
  const {view,free}=present(fixture()),html=render(free,view);
  assert.match(html,/Unknown — not identified/);
  assert.doesNotMatch(html,/&amp;mdash;/);
});

test('Mitsubishi nine-card grid uses three columns and retains the existing Siemens grid',async()=>{
  const {view,free}=present(fixture());assert.match(render(free,view),/plc-controls-grid-mitsubishi/);
  const css=await readFile(new URL('../plc-audit.css',import.meta.url),'utf8');
  assert.match(css,/\.plc-controls-grid-mitsubishi\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  const s=fixture();s.project.platform='Siemens TIA Portal';s.controller={manufacturer:'Siemens',family:'S7-1200',model:'CPU 1212C DC/DC/Rly',orderNumber:'6ES7 212-1HE40-0XB0',firmware:'V4.1',safetyType:''};
  s.networkCount=416;s.callCount=37;s.unassessedCounts=[];
  const v=deriveSnapshotView(s,{status:'REVIEW_REQUIRED'}),f=freeSnapshotResult(s,v),html=render(f,v);
  assert.equal(v.analysisScope,undefined);assert.equal(f.callCount,37);assert.equal(f.networkCount,416);
  assert.equal(f.controller.orderNumber,s.controller.orderNumber);assert.equal(f.controller.firmware,'V4.1');
  assert.match(html,/Supported analysis coverage: <strong>0%/);
  assert.match(html,/<b>37<\/b><span>Calls/);assert.doesNotMatch(html,/plc-controls-grid-mitsubishi/);
  assert.ok(v.findings.some(f=>f.id==='configured-cpu'));
});
