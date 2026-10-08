import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalisePlatformHint,platformMismatch} from '../lib/plc-platform-hints.mjs';
import {buildAuditJob,publicJob,validateUploadRequest} from '../lib/plc-audit-service.mjs';
import {createMockSnapshotResult,validateSnapshotResult} from '../lib/plc-audit-model.mjs';
import {deriveSnapshotView,freeSnapshotResult} from '../lib/plc-snapshot-view.mjs';
const script=await readFile(new URL('../plc-audit.js',import.meta.url),'utf8');
const upload=await readFile(new URL('../plc-audit-upload.html',import.meta.url),'utf8');
function source(manufacturer='Mitsubishi Electric'){
  const s=createMockSnapshotResult({id:'synthetic'});
  s.engineVersion='real-parser/test';
  s.project.platform=manufacturer==='Siemens'?'Siemens TIA Portal':'Mitsubishi GX Works2';
  s.controller={manufacturer,family:manufacturer==='Siemens'?'S7-1200':'',configuredType:manufacturer==='Siemens'?'':'FX3G',
    model:manufacturer==='Siemens'?'CPU 1212C DC/DC/Rly':'',orderNumber:manufacturer==='Siemens'?'6ES7212-1HE40-0XB0':'',firmware:manufacturer==='Siemens'?'V4.1':'',safetyType:''};
  s.platformDetection={manufacturer,platform:s.project.platform,confidence:'VERIFIED'};
  s.topFindings=[{id:'configured-cpu',title:'Saved identity',summary:'Supported source',confidence:'VERIFIED',evidence:['Synthetic typed fields']}];
  return s;
}
function render(job){const c=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,c);return c.renderAuditSnapshot(job);}

test('dropdown precedes file selection with Auto-detect selected and only the requested choices',()=>{
  assert.ok(upload.indexOf('id="plcPlatformHint"')<upload.indexOf('id="plcProjectFile"'));
  assert.match(upload,/<label for="plcPlatformHint">PLC manufacturer \/ platform<\/label>/);
  assert.match(upload,/<option value="AUTO" selected>Auto-detect \(recommended\)<\/option>/);
  assert.equal((upload.match(/<select /g)||[]).length,1);
  assert.deepEqual([...upload.matchAll(/<option value="([A-Z]+)"/g)].map(m=>m[1]),['AUTO','SIEMENS','MITSUBISHI','ROCKWELL','OMRON','SCHNEIDER','OTHER']);
});
test('validated upload hints persist separately without creating detected fields or evidence',()=>{
  assert.equal(validateUploadRequest({filename:'sample.gxw',size:10}).platformHint,'AUTO');
  for(const hint of ['SIEMENS','MITSUBISHI','ROCKWELL','OMRON','SCHNEIDER','OTHER']){
    const input=validateUploadRequest({filename:'sample.gxw',size:10,platformHint:hint});
    const job=buildAuditJob({accountId:'acct_test',filename:input.filename,platformHint:input.platformHint});
    assert.equal(job.platformHint,hint);assert.equal(job.detectedPlatform,null);
    assert.equal(job.detectedManufacturer,null);assert.equal(job.snapshotResult,null);
    const result=publicJob(job);assert.equal(result.platformHint,hint);assert.equal(result.platformMismatch,null);
    assert.equal(result.snapshotView.identityConfidence,'UNKNOWN');
  }
  for(const value of ['Mitsubishi Electric','INVENTED',[],{},1,'SIEMENS; run-command']){
    assert.throws(()=>normalisePlatformHint(value),e=>e.code==='INVALID_PLATFORM_HINT');
  }
});
test('both mismatch directions preserve detected source and render a non-alarmist notice',()=>{
  for(const [hint,manufacturer] of [['MITSUBISHI','Siemens'],['SIEMENS','Mitsubishi Electric']]){
    const s=source(manufacturer),job=publicJob({platformHint:hint,snapshotResult:s,profile:'SNAPSHOT',status:'REVIEW_REQUIRED'});
    assert.equal(job.detectedManufacturer,manufacturer);assert.equal(job.platformHint,hint);
    assert.equal(job.snapshotResult.controller.manufacturer,manufacturer);
    assert.equal(job.platformMismatch.detectedManufacturer,manufacturer);
    const html=render(job);assert.match(html,/Platform mismatch detected/);
    assert.match(html,/user-supplied context/);assert.ok(html.includes(`analysed as ${manufacturer}`));
    assert.equal(job.reportAvailable,false);
  }
});
test('matching, neutral, weak and mock contexts cannot create mismatches or verified manufacturer facts',()=>{
  const s=source();
  for(const hint of ['AUTO','OTHER','MITSUBISHI'])assert.equal(platformMismatch(hint,s),null);
  for(const weak of [{...s,platformDetection:{...s.platformDetection,confidence:'UNKNOWN'}},
    {...s,engineVersion:'ao-plc-mock/test'},
    {...s,platformDetection:undefined,topFindings:[]}]){
    assert.equal(platformMismatch('SIEMENS',weak),null);
    assert.equal(publicJob({snapshotResult:weak,platformHint:'SIEMENS'}).detectedManufacturer,null);
  }
});
test('platform detection extension is typed and must agree with source identity',()=>{
  const s=source();assert.equal(validateSnapshotResult(s).valid,true);
  for(const detection of [null,[],{...s.platformDetection,confidence:'INFERRED'},
    {...s.platformDetection,manufacturer:'Siemens'},{...s.platformDetection,platform:'Wrong'},
    {...s.platformDetection,platform:undefined}]){
    assert.equal(validateSnapshotResult({...s,platformDetection:detection}).valid,false);
  }
});
test('Mitsubishi identity presents verified programming family/type and unverified main unit without guessing',()=>{
  const s=source(),view=deriveSnapshotView(s,{status:'REVIEW_REQUIRED'}),free=freeSnapshotResult(s,view);
  assert.equal(view.controllerIdentity.level,'PROGRAMMING_TARGET');
  assert.equal(view.controllerIdentity.family,'MELSEC-F / FX3G');
  assert.equal(view.controllerIdentity.exactPhysicalMainUnit.status,'NOT VERIFIED');
  assert.equal(free.controller.family,'MELSEC-F / FX3G');assert.equal(s.controller.family,'','legacy stored evidence is preserved');
  const html=render({snapshotResult:free,snapshotView:view,status:'REVIEW_REQUIRED'});
  assert.match(html,/PLC family/);assert.match(html,/MELSEC-F \/ FX3G/);
  assert.match(html,/Configured PLC type/);assert.match(html,/Exact physical main unit/);
  assert.match(html,/NOT VERIFIED/);assert.match(html,/installed PLC label or an online hardware check/);
  assert.doesNotMatch(html,/Configured controller|Configured CPU \/ model|FX3G-(?:14|24|40|60)|(?:MR|MT)\/ES/);
  assert.equal(free.controller.model,'');assert.equal(free.controller.orderNumber,'');
  assert.equal(view.recoveryChecks.find(c=>c.label==='PLC family identified').status,'CONFIRMED');
  assert.equal(view.recoveryChecks.find(c=>c.label==='Exact physical main unit identified').status,'NOT VERIFIED');
});
test('Siemens exact CPU/order/firmware remain intact despite a Mitsubishi hint',()=>{
  const s=source('Siemens'),job=publicJob({snapshotResult:s,platformHint:'MITSUBISHI',status:'REVIEW_REQUIRED',profile:'SNAPSHOT'});
  assert.equal(job.snapshotView.controllerIdentity.level,'CONFIGURED_CPU');
  assert.equal(job.snapshotResult.controller.model,'CPU 1212C DC/DC/Rly');
  assert.equal(job.snapshotResult.controller.orderNumber,'6ES7212-1HE40-0XB0');
  assert.equal(job.snapshotResult.controller.firmware,'V4.1');
  assert.match(render(job),/Configured controller/);
  assert.equal(job.snapshotView.recoveryChecks.find(c=>c.label==='Exact CPU identified').status,'CONFIRMED');
});
test('explicit stronger Mitsubishi identity is retained and arbitrary future fields remain private',()=>{
  const s=source();Object.assign(s.controller,{model:'FX3G-40MR/ES',orderNumber:'FX3G-40MR/ES',family:'MELSEC-F / FX3G'});
  s.platformDetection.privateTrace='PRIVATE_WRITER_TRACE';
  const v=deriveSnapshotView(s,{status:'REVIEW_REQUIRED'}),free=freeSnapshotResult(s,v);
  assert.equal(v.controllerIdentity.exactPhysicalMainUnit.status,'VERIFIED');
  assert.match(render({snapshotResult:free,snapshotView:v,status:'REVIEW_REQUIRED'}),/FX3G-40MR\/ES/);
  assert.ok(!JSON.stringify(free).includes('PRIVATE_WRITER_TRACE'));
});

test('browser upload sends the selected hint only as context in create-upload',async()=>{
  for(const hint of ['MITSUBISHI','SIEMENS','AUTO']){
    let submitCallback,createdBody;
    const submit={disabled:false},file={name:'synthetic.gxw',size:100,type:''};
    const form={querySelector:()=>submit,addEventListener:(_,callback)=>submitCallback=callback};
    const elements={plcUploadForm:form,plcProjectFile:{files:[file]},plcPlatformHint:{value:hint},uploadStatus:{textContent:''}};
    const c=vm.createContext({URL,URLSearchParams,location:{href:'',origin:'https://preview.example'},sessionStorage:{setItem(){}},
      document:{addEventListener(){},getElementById:id=>elements[id],querySelector:()=>({style:{}})},
      fetch:async(url,options)=>{if(String(url).includes('create-upload')){createdBody=JSON.parse(options.body);return {ok:true,json:async()=>({job:{id:'aud_fixture'},upload:{url:'https://private-upload.example/',headers:{}},confirmationRef:'ref'})};}
        if(String(url).includes('confirm-upload'))return {ok:true,json:async()=>({job:{status:'QUEUED'}})};
        return {ok:true};}});
    vm.runInContext(script,c);await c.initUpload();await submitCallback({preventDefault(){}});
    assert.equal(createdBody.platformHint,hint);assert.equal(createdBody.detectedManufacturer,undefined);
    assert.equal(createdBody.platformDetection,undefined);assert.equal(submit.disabled,true);
  }
});
