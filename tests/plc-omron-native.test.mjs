import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {deriveSnapshotView,freeSnapshotResult} from '../lib/plc-snapshot-view.mjs';
import {validateUploadRequest} from '../lib/plc-audit-service.mjs';
import {validateSnapshotResult} from '../lib/plc-audit-model.mjs';
const script=await readFile(new URL('../plc-audit.js',import.meta.url),'utf8');
function sample(decoded=true){return {schemaVersion:2,
  project:{platform:decoded?'Omron CX-Programmer':'Omron Sysmac Studio',engineeringSoftware:decoded?'CX-Programmer / CX-One':'Sysmac Studio',projectName:'Synthetic',projectVersion:''},
  controller:{manufacturer:'Omron',family:decoded?'CP2E-N':'NX102',configuredType:decoded?'CP2E-N':'NX102',model:decoded?'':'NX102-9000',orderNumber:decoded?'':'NX102-9000',firmware:'',safetyType:''},
  blockCount:1,networkCount:decoded?1:null,callCount:null,writeCount:decoded?2:null,multipleWriterCount:decoded?1:null,investigationCount:1,
  unassessedCounts:decoded?['callCount']:['networkCount','callCount','writeCount','multipleWriterCount'],
  ...(decoded?{instructionCount:4}:{}),programBreakdown:{organisationBlocks:null,functionBlocks:null,functions:null,dataBlocks:null,safetyBlocks:null},
  hardwareSummary:{configuredIoPoints:null,digitalInputs:null,digitalOutputs:null,analogueInputs:null,analogueOutputs:null,remoteIoStations:null,networkDevices:null,communications:[],ioMappingStatus:'Not assessed'},
  supportedAreas:['Supplied program-unit inventory',...(decoded?['Decoded Omron instruction inventory','Detected source write sites']:[])],
  unsupportedAreas:['Unsupported native semantics'],analysisCoveragePercent:0,evidenceConfidence:'UNKNOWN',engineVersion:'real-parser/test',generatedAt:'2026-10-08T12:00:00Z',
  topFindings:[{id:'configured-cpu',title:'Saved controller',confidence:'VERIFIED',summary:'Saved identity',evidence:['Synthetic typed record']},
    ...(decoded?[{id:'writers-1',title:'PRIVATE_TARGET',confidence:'VERIFIED',summary:'PRIVATE_ADDRESS',evidence:['PRIVATE_SOURCE']}]:[])],maintenanceSummary:{}};}
function present(s){const view=deriveSnapshotView(s,{status:'REVIEW_REQUIRED'}),free=freeSnapshotResult(s,view);
  const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);
  return {view,free,html:context.renderSnapshot(free,null,view)};}
test('CX native counts and scope survive validation and free projection without private write details',()=>{
  const {view,free,html}=present(sample());
  assert.equal(validateSnapshotResult(free).valid,true);assert.equal(view.analysisScope.status,'PARTIAL');
  assert.equal(free.callCount,null);assert.equal(free.writeCount,2);assert.equal(view.sharedControl.count,1);
  assert.match(html,/Analysis scope: <strong>PARTIAL/);assert.doesNotMatch(html,/0%|PRIVATE_TARGET|PRIVATE_ADDRESS|PRIVATE_SOURCE/);
  assert.match(html,/<b>1<\/b><span>Supported source rungs/);assert.match(html,/<b>—<\/b><span>Calls/);
  assert.match(html,/<b>1<\/b><span>Program units/);assert.doesNotMatch(html,/<span>OBs<\/span>/);
});
test('Sysmac inventory retains configured CPU without inventing logic or firmware',()=>{
  const {view,free,html}=present(sample(false));assert.equal(validateSnapshotResult(free).valid,true);
  assert.equal(view.analysisScope.status,'LIMITED');assert.equal(free.controller.model,'NX102-9000');
  assert.equal(free.controller.firmware,'');assert.equal(view.sharedControl.count,null);
  assert.match(html,/Analysis scope: <strong>LIMITED/);assert.doesNotMatch(html,/0%/);
  for(const label of ['Calls','Writes','Networks','Shared-write targets'])assert.ok(html.includes(`<b>—</b><span>${label}</span>`));
});
test('partial Omron observations cannot become zero shared writes or claim undecoded instructions',()=>{
  const s=sample();s.multipleWriterCount=null;s.unassessedCounts.push('multipleWriterCount');
  const {view}=present(s);assert.equal(view.sharedControl.count,null);
  assert.match(view.logic.explanation,/Some source instructions have been decoded/);
});
test('native extensions are accepted without treating the user hint as evidence',()=>{
  for(const extension of ['ap21','zap21','ap15_1','zap15_1','cxp','cxt','smc2','csm2','smc','csm']){
    const upload=validateUploadRequest({filename:`synthetic.${extension}`,size:100,contentType:'application/octet-stream',platformHint:'SIEMENS'});
    assert.equal(upload.platformHint,'SIEMENS');assert.equal(upload.filename,`synthetic.${extension}`);
  }
});
