import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {deriveSnapshotView,freeSnapshotResult} from '../lib/plc-snapshot-view.mjs';
import {publicJob} from '../lib/plc-audit-service.mjs';
import {validateSnapshotResult} from '../lib/plc-audit-model.mjs';
const privateDetail='PRIVATE_Q42_3_TARGET_BLOCK7_NETWORK9_TRACE';
const script=await readFile(new URL('../plc-audit.js',import.meta.url),'utf8');
function snapshot(platform='Mitsubishi GX Works2') {
  return {schemaVersion:2,project:{platform,engineeringSoftware:'Engineering tool',projectName:'Synthetic',projectVersion:''},
    controller:{manufacturer:platform==='Mitsubishi GX Works2'?'Mitsubishi Electric':'Siemens',family:'',configuredType:'FX3G',model:'',orderNumber:'',firmware:'',safetyType:''},
    programBreakdown:{organisationBlocks:null,functionBlocks:null,functions:null,dataBlocks:null,safetyBlocks:null},
    hardwareSummary:{configuredIoPoints:null,digitalInputs:null,digitalOutputs:null,analogueInputs:null,analogueOutputs:null,remoteIoStations:null,networkDevices:null,communications:[],ioMappingStatus:'Not assessed'},
    blockCount:1,networkCount:null,callCount:null,writeCount:487,multipleWriterCount:104,investigationCount:4,
    unassessedCounts:['networkCount','callCount'],instructionCount:1833,
    programStructure:{plcSteps:2978,contactInstructions:1250,timerInstructions:87,counterInstructions:5,setResetInstructions:133,arithmeticInstructions:32,transferInstructions:100,inputReferences:44,outputReferences:29},
    supportedAreas:['Supplied program-unit inventory','Decoded Mitsubishi instruction inventory','Detected source write sites'],
    unsupportedAreas:['Whole-project completeness',`Unsupported source ${privateDetail}`],analysisCoveragePercent:0,evidenceConfidence:'UNKNOWN',engineVersion:'real-parser/test',generatedAt:'2026-10-08T12:00:00Z',
    maintenanceSummary:{},topFindings:[{id:'configured-cpu',title:'Saved type',summary:'Saved type',confidence:'VERIFIED',evidence:['Typed saved field']},
      {id:'writers-1',title:privateDetail,summary:privateDetail,confidence:'VERIFIED',evidence:[privateDetail]}]};
}
function present(s,options={}){
  const view=deriveSnapshotView(s,{status:'REVIEW_REQUIRED',projectAvailable:Boolean(s),...options});
  const free=freeSnapshotResult(s,view);
  const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);
  return {view,offer:view.engineerReview,free,html:context.renderSnapshot(free,options.lifecycle,view)};
}
const ids=rows=>rows.map(row=>row.id);
test('decoded Mitsubishi scopes the actual shared/output/timer counts and concrete matching deliverables',()=>{
  const s=snapshot(),before=JSON.stringify(s),{offer,html,free}=present(s);
  assert.equal(validateSnapshotResult(free).valid,true);
  for(const title of ['104 shared-write targets','29 referenced output addresses','87 timer instructions'])assert.ok(offer.investigations.some(row=>row.title===title));
  for(const id of ['ranked-findings','target-identities','writer-tracing','source-references','output-permissives','timing-review','source-limitations','identity-lifecycle','recovery-plan','maintenance','conclusion'])assert.ok(ids(offer.deliverables).includes(id),id);
  assert.ok(offer.deliverables.some(row=>row.title==='Program / instruction references'));
  assert.ok(!offer.deliverables.some(row=>row.title==='Block/network references'));
  assert.equal(offer.investigations.find(row=>row.id==='outputs').confidence,'UNKNOWN','aggregate counts do not upgrade evidence confidence');
  assert.equal(offer.teasers.length,1);assert.equal(offer.teasers[0].confidence,'VERIFIED');
  assert.match(offer.teasers[0].detail,/priority has not yet been assigned/);
  assert.equal(JSON.stringify(s),before);assert.doesNotMatch(JSON.stringify(offer),new RegExp(privateDetail));
  assert.doesNotMatch(html,new RegExp(privateDetail));
});
test('Siemens offers block/network references without inventing output-reference or timer counts',()=>{
  const s=snapshot('Siemens TIA Portal');delete s.programStructure;delete s.instructionCount;
  s.supportedAreas=['Supplied block inventory','Detected source write sites'];s.networkCount=416;s.unassessedCounts=['callCount'];
  s.controller={manufacturer:'Siemens',family:'S7-1200',model:'Configured test CPU',orderNumber:'TEST-PART',firmware:'V4.1',safetyType:''};
  const {offer}=present(s,{lifecycle:{status:'ACTIVE'}});
  assert.ok(offer.deliverables.some(row=>row.title==='Block/network references'));
  assert.ok(!ids(offer.investigations).some(id=>['outputs','timing','identity-lifecycle','lifecycle'].includes(id)));
  assert.equal(offer.teasers.length,1);
});
test('Omron CX gets source-rung references; Sysmac inventory does not promise writer tracing',()=>{
  const cx=snapshot('Omron CX-Programmer');cx.controller.manufacturer='Omron';
  cx.supportedAreas=['Supplied program-unit inventory','Decoded Omron instruction inventory','Detected source write sites'];
  cx.networkCount=5;cx.unassessedCounts=['callCount'];delete cx.programStructure;
  const cxOffer=present(cx).offer;
  assert.ok(cxOffer.deliverables.some(row=>row.title==='Program / section / source-rung references'));
  const sys=snapshot('Omron Sysmac Studio');sys.controller.manufacturer='Omron';sys.supportedAreas=['Supplied program-unit inventory'];
  sys.unassessedCounts=['networkCount','callCount','writeCount','multipleWriterCount'];sys.writeCount=sys.multipleWriterCount=null;
  delete sys.instructionCount;delete sys.programStructure;sys.topFindings=sys.topFindings.slice(0,1);
  const offer=present(sys).offer;
  assert.ok(ids(offer.investigations).includes('unsupported-source'));
  assert.ok(!ids(offer.deliverables).some(id=>['target-identities','writer-tracing','source-references','output-permissives','timing-review'].includes(id)));
  assert.equal(offer.teasers.length,0);
});
test('inventory-only, unassessed and zero metrics do not produce count rows or hidden findings',()=>{
  const s=snapshot();delete s.instructionCount;s.supportedAreas=['Supplied program-unit inventory'];
  s.unassessedCounts=['networkCount','callCount','writeCount','multipleWriterCount'];s.writeCount=s.multipleWriterCount=0;
  const {offer}=present(s);
  assert.ok(!ids(offer.investigations).some(id=>['shared-writes','outputs','timing'].includes(id)));
  assert.equal(offer.teasers.length,0);
  const zero=snapshot();zero.multipleWriterCount=0;zero.programStructure.outputReferences=zero.programStructure.timerInstructions=0;
  const z=present(zero).offer;assert.ok(!ids(z.investigations).some(id=>['shared-writes','outputs','timing'].includes(id)));assert.equal(z.teasers.length,0);
});
test('a positive shared count alone cannot fabricate retained detailed findings',()=>{
  for(const records of [[],[{id:'writers-1',confidence:'VERIFIED',evidence:[]}],
    [{id:'writers-1',confidence:'VERIFIED',evidence:['  ']}],
    [{id:'writers-1',confidence:'UNKNOWN',evidence:[privateDetail]}]]){
    const s=snapshot();s.topFindings=[s.topFindings[0],...records];
    const {offer}=present(s);assert.ok(ids(offer.investigations).includes('shared-writes'));assert.equal(offer.teasers.length,0);
  }
  const s=snapshot();s.topFindings[1].confidence='INFERRED';
  assert.equal(present(s).offer.teasers[0].confidence,'INFERRED','inferred evidence is not promoted');
  s.topFindings.push({id:'writers-2',confidence:'UNKNOWN',evidence:[privateDetail]});
  assert.equal(present(s).offer.teasers.length,0,'mixed unknown scope remains conservative');
});
test('mock and absent/weak evidence cannot manufacture a project-specific paid deliverable',()=>{
  const mock=snapshot();mock.engineVersion='ao-plc-mock/test';
  const weak={project:{platform:'Unverified file'},controller:{model:'Unverified text'},blockCount:0,supportedAreas:[],topFindings:[]};
  for(const s of [null,mock,weak]){
    const {offer}=present(s);assert.deepEqual(offer.investigations,[]);assert.deepEqual(offer.deliverables,[]);assert.deepEqual(offer.teasers,[]);
  }
});
test('identity/lifecycle/recovery plans follow evidence without claiming absent backups or compatibility',()=>{
  const s=snapshot();const {offer}=present(s);
  const identity=offer.investigations.find(row=>row.id==='identity-lifecycle');
  assert.match(identity.investigation,/physical model from the PLC label/);
  assert.doesNotMatch(JSON.stringify(offer),/this exact order number|backup is missing|backups are missing/);
  assert.match(offer.investigations.find(row=>row.id==='recovery').investigation,/HMI backup and drive parameter backup availability/);
  s.controller.model='Configured CPU';s.controller.orderNumber='TEST-PART';
  for(const lifecycle of [{status:'STALE'},{status:'DISCONTINUED'},{status:'ACTIVE',familyNotice:{stale:false}}]){
    const plan=present(s,{lifecycle}).offer;
    assert.ok(ids(plan.investigations).includes('lifecycle'));assert.ok(!ids(plan.investigations).includes('identity-lifecycle'));
  }
  s.topFindings[0].confidence='INFERRED';
  assert.ok(ids(present(s,{lifecycle:{status:'ACTIVE'}}).offer.investigations).includes('identity-lifecycle'));
});
test('commercial copy sits immediately before the scoped primary CTA and keeps critical limitations',()=>{
  const {html}=present(snapshot());
  const boundary='Detailed target identities, writer locations and priority rankings are intentionally reserved for Engineer Review.';
  for(const text of ['What Engineer Review would investigate','Your Engineer Review would include',boundary,
    '£495–£795, scoped before work begins',
    'We review the areas highlighted by your Snapshot and return a prioritised engineering conclusion. Scope is agreed before any paid work begins.'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/>Request Engineer Review<\/a>/g)||[]).length,1);
  const start=html.indexOf('What Engineer Review would investigate'),cta=html.indexOf('>Request Engineer Review</a>');
  assert.ok(start<cta&&html.indexOf('Your Engineer Review would include')<cta&&html.indexOf(boundary)<cta);
  assert.doesNotMatch(html,/Request shared-control review|Areas requiring deeper engineering review/);
  assert.match(html,/No live comparison or engineering priority ranking/);
  assert.match(html,/No safety integrity, machine compliance or live safety assessment/);
  assert.match(html,/NOT SUPPLIED means absence established within an assessed evidence scope/);
  assert.match(html,/Visual rung boundaries remain unassessed/);
});
test('customer API and legacy rendering retain private evidence while exposing only aggregate review scope',()=>{
  const s=snapshot();s.engineerReview={investigations:[{title:privateDetail}],teasers:[{title:privateDetail}]};s.futureReview=privateDetail;
  const before=JSON.stringify(s),customer=publicJob({id:'aud_synthetic',status:'REVIEW_REQUIRED',profile:'SNAPSHOT',snapshotResult:s});
  assert.doesNotMatch(JSON.stringify(customer),new RegExp(privateDetail));
  assert.ok(customer.snapshotView.engineerReview.teasers.length);assert.equal(customer.snapshotResult.engineerReview,undefined);
  assert.equal(JSON.stringify(s),before);assert.ok(JSON.stringify(s).includes(privateDetail));
  const {view,html}=present(s);assert.doesNotMatch(html,new RegExp(privateDetail));
  const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);
  const legacy={...view};delete legacy.engineerReview;
  const legacyResult={...freeSnapshotResult(s,view),topFindings:s.topFindings,maintenanceSummary:s.maintenanceSummary,engineerReview:s.engineerReview};
  const htmlLegacy=context.renderSnapshot(legacyResult,null,legacy);
  assert.doesNotMatch(htmlLegacy,new RegExp(privateDetail),'client never constructs teasers from legacy raw findings');
  assert.doesNotMatch(htmlLegacy,/Shared-write control path — details available/);
});
test('review text escapes markup and deliverables do not duplicate overlapping investigation areas',()=>{
  const {view,offer}=present(snapshot());
  assert.equal(new Set(ids(offer.deliverables)).size,offer.deliverables.length);
  view.engineerReview.investigations[0].title='<script>test</script>';
  const context=vm.createContext({URL,document:{addEventListener(){}}});vm.runInContext(script,context);
  assert.doesNotMatch(context.renderSnapshot({},null,view),/<script>/);
});

test('source references stay relevant to output/timing review without claiming shared writers',()=>{
  const s=snapshot();s.multipleWriterCount=0;s.topFindings=s.topFindings.slice(0,1);
  const {offer}=present(s);
  assert.ok(offer.deliverables.some(row=>row.title==='Program / instruction references'));
  assert.ok(!ids(offer.deliverables).includes('writer-tracing'));assert.equal(offer.teasers.length,0);
});

test('positively assessed zero network devices does not create a communications investigation',()=>{
  const s=snapshot();s.hardwareSummary.networkDevices=0;
  assert.ok(!ids(present(s).offer.investigations).includes('communications'));
  s.hardwareSummary.networkDevices=1;
  assert.ok(ids(present(s).offer.investigations).includes('communications'));
});
