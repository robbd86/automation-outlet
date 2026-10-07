import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { deriveSnapshotView, freeSnapshotResult } from '../lib/plc-snapshot-view.mjs';
import { publicJob, buildAuditJob, createReportDownload } from '../lib/plc-audit-service.mjs';
import { createMockSnapshotResult } from '../lib/plc-audit-model.mjs';
import { issueSessionToken, PLC_SESSION_COOKIE } from '../lib/plc-audit-auth.mjs';
import handler from '../lib/plc-audit-handler.mjs';

const source = await readFile(new URL('../plc-audit.js', import.meta.url), 'utf8');
const rawTarget = 'PRIVATE_TARGET_PERMISSIVE_ADDRESS_Q42_3';
const base = () => ({ schemaVersion: 2, project: { platform: 'Vendor engineering platform', engineeringSoftware: 'Engineering Tool', projectName: 'Synthetic sample', projectVersion: '1' },
  controller: { manufacturer: 'Example Manufacturer', family: 'Example PLC family', model: 'Configured test CPU', orderNumber: 'EXACT-SYNTHETIC-PART', firmware: 'V1', safetyType: '' },
  programBreakdown: { organisationBlocks: 2, functionBlocks: 23, functions: 3, dataBlocks: null, safetyBlocks: null },
  hardwareSummary: { configuredIoPoints: null, communications: [], remoteIoStations: null },
  blockCount: 30, networkCount: 416, callCount: 37, writeCount: 418, multipleWriterCount: 48, investigationCount: 74,
  analysisCoveragePercent: 0, supportedAreas: ['Supplied block inventory', 'Detected source write sites'],
  unsupportedAreas: ['Whole-project completeness', `Unsupported instruction at ${rawTarget}`],
  evidenceConfidence: 'UNKNOWN', engineVersion: 'real-parser/test', generatedAt: '2026-10-07T12:00:00Z',
  maintenanceSummary: { headline: rawTarget, managerPoints: [rawTarget], recommendedActions: [rawTarget] },
  topFindings: [{ id: 'configured-cpu', confidence: 'VERIFIED', title: 'Configured CPU identity', summary: 'Configured evidence', evidence: [] },
    { id: 'writers-2', confidence: 'VERIFIED', title: `Multiple write locations: ${rawTarget}`, summary: `Trace ${rawTarget}`, evidence: [`Network 7: ${rawTarget}`] }],
});
const derive = (s = base(), options = {}) => deriveSnapshotView(s, { status: 'REVIEW_REQUIRED', projectAvailable: true, ...options });
const lifecycle = status => ({ status, label: status, manufacturerStatus: status, checkedAt: '2026-10-07', sources: [] });

test('manager assessments identify supported shared writes without claiming a fault or scoring risk', () => {
  const v = derive();
  assert.equal(v.overall.label, 'ATTENTION');
  assert.equal(v.logic.label, 'ATTENTION');
  assert.equal(v.sharedControl.count, 48);
  assert.equal(v.sharedControl.confidence, 'VERIFIED');
  assert.match(v.sharedControl.explanation, /do not automatically indicate a programming fault/);
  assert.equal(v.complexity, 'NOT ASSESSED');
  assert.equal(v.score, undefined);
  assert.ok(v.nextActions.length <= 5);
});
test('missing evidence, zero coverage and absent snapshots never become low concern', () => {
  const unknown = deriveSnapshotView(null);
  assert.equal(unknown.overall.label, 'NOT ASSESSED');
  assert.equal(unknown.logic.label, 'NOT ASSESSED');
  assert.equal(unknown.sharedControl.count, null);
  const partial = base(); partial.multipleWriterCount = 0; partial.topFindings = [];
  assert.equal(derive(partial).overall.label, 'REVIEW');
  assert.equal(derive(partial).sharedControl.confidence, 'UNKNOWN');
  assert.notEqual(derive(partial).logic.label, 'LOW CONCERN');
  const unsupportedIdentityOnly = { project: { platform: 'Detected file platform' }, controller: { model: 'Unverified model text' },
    blockCount: 0, analysisCoveragePercent: 0, supportedAreas: [], topFindings: [] };
  assert.equal(derive(unsupportedIdentityOnly).overall.label, 'NOT ASSESSED');
  assert.equal(derive(unsupportedIdentityOnly).logic.label, 'NOT ASSESSED');
});
test('zero shared writes is low concern only within a complete verified writer-analysis scope', () => {
  const s = base(); s.multipleWriterCount = 0; s.topFindings = []; s.analysisCoveragePercent = 100;
  s.evidenceConfidence = 'VERIFIED'; s.unsupportedAreas = ['Live machine behaviour'];
  const v = derive(s, { status: 'COMPLETE' });
  assert.equal(v.logic.label, 'LOW CONCERN');
  assert.equal(v.sharedControl.confidence, 'VERIFIED');
  assert.equal(v.overall.label, 'REVIEW', 'live match and recovery are still unverified');
  s.supportedAreas = ['Supplied block inventory'];
  assert.equal(derive(s, { status: 'COMPLETE' }).logic.label, 'NOT ASSESSED');
});
test('inferred, unknown and mixed writer confidence are kept distinct', () => {
  const s = base(); s.topFindings[1].confidence = 'INFERRED';
  assert.equal(derive(s).sharedControl.confidence, 'INFERRED');
  s.topFindings.push({ id: 'writers-3', confidence: 'UNKNOWN' });
  assert.equal(derive(s).sharedControl.confidence, 'UNKNOWN');
  assert.equal(derive(s).overall.label, 'REVIEW');
});
test('lifecycle phase-out and discontinued status affect planning, while stale reviews do not', () => {
  const s = base(); s.multipleWriterCount = 0;
  assert.equal(derive(s, { lifecycle: lifecycle('DISCONTINUED') }).overall.label, 'HIGH PRIORITY');
  assert.equal(derive(s, { lifecycle: lifecycle('PHASE_OUT') }).overall.label, 'ATTENTION');
  assert.equal(derive(s, { lifecycle: lifecycle('STALE') }).overall.label, 'REVIEW');
  const activeFamily = { ...lifecycle('ACTIVE'), familyNotice: { scope: 'Family notice' } };
  assert.equal(derive(s, { lifecycle: activeFamily }).overall.label, 'REVIEW');
  assert.equal(derive(s, { lifecycle: activeFamily }).lifecycle.label, 'REVIEW');
  assert.equal(derive(s, { lifecycle: activeFamily }).discussModernisation, true);
});
test('recovery statuses describe available evidence without certifying current backups or safety', () => {
  const v = derive();
  const check = label => v.recoveryChecks.find(item => item.label === label);
  assert.equal(check('Exact CPU identified').status, 'CONFIRMED');
  assert.equal(check('Hardware configuration identifiable').status, 'PARTIAL');
  assert.equal(check('Network configuration identifiable').status, 'NOT ASSESSED');
  assert.equal(check('HMI backup supplied').status, 'NOT SUPPLIED');
  assert.match(check('HMI backup supplied').detail, /analysed evidence/);
  assert.match(check('HMI backup supplied').detail, /whether a backup exists elsewhere/);
  assert.equal(check('Drive parameter backup supplied').status, 'NOT SUPPLIED');
  assert.equal(check('Project verified against live PLC').status, 'NOT VERIFIED');
  assert.equal(check('Replacement controller strategy assessed').status, 'NOT ASSESSED');
  assert.equal(v.safety.label, 'NOT ASSESSED');
  assert.ok(!v.recoveryChecks.some(item => item.status === 'NOT APPLICABLE'));
});
test('missing firmware stays unknown and partial identity is never promoted to confirmed', () => {
  const s = base(); s.controller.firmware = ''; s.topFindings[0].confidence = 'INFERRED';
  const v = derive(s);
  assert.equal(v.recoveryChecks.find(item => item.label === 'Exact CPU identified').status, 'PARTIAL');
  assert.equal(v.recoveryChecks.find(item => item.label === 'Configured firmware identified').status, 'NOT VERIFIED');
});
test('paid handoff areas follow evidence and do not invent safety, networks or obsolescence', () => {
  const v = derive();
  assert.ok(v.deeperAreas.some(item => item.title === 'Shared control paths'));
  assert.ok(!v.deeperAreas.some(item => /Safety|Network|lifecycle/.test(item.title)));
  assert.equal(v.discussModernisation, false);
  const s = base(); s.controller.safetyType = 'Configured safety type'; s.hardwareSummary.communications = ['Configured protocol'];
  const more = derive(s);
  assert.ok(more.deeperAreas.some(item => /Safety/.test(item.title)));
  assert.ok(more.deeperAreas.some(item => /Network/.test(item.title)));
});
test('mock adapter metrics cannot become an engineering assessment', () => {
  const s = createMockSnapshotResult({ id: 'sample', filename: 'test.ap14' });
  const v = derive(s, { status: 'COMPLETE' });
  assert.equal(v.overall.label, 'NOT ASSESSED');
  assert.equal(v.sharedControl.count, null);
  assert.equal(v.findings.length, 0);
});
test('free API projection excludes targets, traces, arbitrary future fields and raw recommendations', () => {
  const s = base(), before = JSON.stringify(s);
  s.extraInvestigation = rawTarget; s.controller.writerTrace = rawTarget;
  const v = derive(s), free = freeSnapshotResult(s, v);
  assert.doesNotMatch(JSON.stringify(free), new RegExp(rawTarget));
  assert.equal(free.multipleWriterCount, 48);
  assert.equal(free.controller.model, s.controller.model);
  assert.equal(free.extraInvestigation, undefined);
  assert.equal(free.controller.writerTrace, undefined);
  delete s.extraInvestigation; delete s.controller.writerTrace;
  assert.equal(JSON.stringify(s), before, 'projection leaves source analysis intact');
  assert.doesNotMatch(JSON.stringify(publicJob({ id: 'test', profile: 'SNAPSHOT', status: 'REVIEW_REQUIRED', snapshotResult: s })), new RegExp(rawTarget));
});
test('controller record provenance survives without delivering per-target evidence', () => {
  const s = base(), hash = 'a'.repeat(64), fileHash = 'b'.repeat(64);
  s.topFindings[0].evidence = [`project/System/record.plf: object[123]/sha256[${hash}]; file sha256 ${fileHash}`];
  const free = freeSnapshotResult(s, derive(s));
  assert.deepEqual(free.controllerEvidence, [`Project record object[123]`, `Record SHA-256 ${hash}`, `Source file SHA-256 ${fileHash}`]);
});
test('manager-first rendering preserves scope, confidence and metrics and never renders paid traces', () => {
  const s = base(), v = derive(s), free = freeSnapshotResult(s, v);
  const context = vm.createContext({ URL, document: { addEventListener() {} } });
  vm.runInContext(source, context);
  // Defence in depth: old per-target finding/summary fields are ignored by the renderer.
  const legacy = { ...free, topFindings: s.topFindings, maintenanceSummary: s.maintenanceSummary };
  const html = context.renderSnapshot(legacy, null, v);
  assert.doesNotMatch(html, new RegExp(rawTarget));
  for (const heading of ['Machine Controls Snapshot', 'What this means for your site', 'Machine Recovery Readiness',
    'Shared Control / Multiple Writers', 'Program &amp; Controls Complexity', 'Top Findings', 'Recommended Next Actions',
    'Areas requiring deeper engineering review', 'Technical Evidence &amp; Analysis Detail']) assert.ok(html.includes(heading));
  assert.ok(html.indexOf('Machine Controls Snapshot') < html.indexOf('Technical Evidence &amp; Analysis Detail'));
  assert.match(html, /<details[^>]+id="technicalEvidence">/);
  assert.match(html, /VERIFIED/);
  assert.match(html, /NOT SUPPLIED/);
  assert.match(html, /NOT ASSESSED/);
  assert.match(html, /Program size alone/);
  assert.match(html, /Request Engineer Review/);
  assert.doesNotMatch(html, /Discuss Modernisation/);
  assert.match(context.renderSnapshot(free, null, v), /416/);
  s.controller.model = '<script>alert(1)</script>';
  assert.doesNotMatch(context.renderSnapshot(s, null, derive(s)), /<script>/);
});
test('customer route enforces free projection and prevents report download while retaining full stored evidence', async () => {
  const previousFetch = globalThis.fetch;
  const previous = Object.fromEntries(['AO_GITHUB_TOKEN', 'AO_PLC_SESSION_SECRET'].map(key => [key, process.env[key]]));
  process.env.AO_GITHUB_TOKEN = 'local-test-token';
  process.env.AO_PLC_SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  const job = buildAuditJob({ id: 'aud_safe', accountId: 'acct_owner', filename: 'sample.zip' });
  job.status = 'REVIEW_REQUIRED'; job.snapshotResult = base(); job.reportArtifact = { pathname: 'private/full-report.html' };
  const issue = { number: 1, body: `<!-- AO_PLC_AUDIT_B64:${Buffer.from(JSON.stringify(job)).toString('base64')} -->` };
  globalThis.fetch = async url => { assert.match(String(url), /^https:\/\/api.github.com\/repos\//); return Response.json([issue]); };
  const request = async (action, accountId = 'acct_owner') => {
    const { token } = issueSessionToken(accountId);
    const res = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
    await handler({ method: 'GET', query: { action, id: job.id }, headers: { cookie: `${PLC_SESSION_COOKIE}=${token}` } }, res);
    return res;
  };
  try {
    for (const action of ['get', 'list']) {
      const r = await request(action);
      assert.equal(r.statusCode, 200);
      assert.doesNotMatch(JSON.stringify(r.body), new RegExp(rawTarget));
    }
    assert.equal(publicJob(job).reportAvailable, false);
    assert.equal((await request('report-url')).statusCode, 403);
    assert.equal((await request('report-url', 'acct_other')).statusCode, 404);
    await assert.rejects(createReportDownload('acct_owner', job.id), error => error.code === 'ENGINEER_REVIEW_REQUIRED');
    const saved = JSON.parse(Buffer.from(issue.body.match(/AO_PLC_AUDIT_B64:([A-Za-z0-9+/=]+)/)[1], 'base64'));
    assert.deepEqual(saved.snapshotResult, job.snapshotResult);
    assert.match(JSON.stringify(saved.snapshotResult), new RegExp(rawTarget));
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
