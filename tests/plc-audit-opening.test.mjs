import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { buildAuditJob, createUploadConfirmationRef } from '../lib/plc-audit-service.mjs';
import { issueSessionToken, PLC_SESSION_COOKIE } from '../lib/plc-audit-auth.mjs';
import plcAuditHandler from '../lib/plc-audit-handler.mjs';

test('new audit can open before Issue-list indexing without bypassing ownership', async () => {
  const oldFetch = globalThis.fetch;
  const previous = { AO_GITHUB_TOKEN: process.env.AO_GITHUB_TOKEN, AO_PLC_SESSION_SECRET: process.env.AO_PLC_SESSION_SECRET };
  process.env.AO_GITHUB_TOKEN = 'test-token';
  process.env.AO_PLC_SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  const job = buildAuditJob({ accountId: 'acct_owner', filename: 'new.zip', id: 'aud_new' });
  job.status = 'QUEUED';
  const issue = { number: 280, body: `<!-- AO_PLC_AUDIT_B64:${Buffer.from(JSON.stringify(job)).toString('base64')} -->` };
  globalThis.fetch = async url => Response.json(new URL(url).pathname.endsWith('/issues/280') ? issue : []);
  const read = async (accountId, id, confirmationRef) => {
    const { token } = issueSessionToken(accountId);
    const response = { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
    await plcAuditHandler({ method: 'GET', query: { action: 'get', id, confirmationRef }, headers: { cookie: `${PLC_SESSION_COOKIE}=${token}` } }, response);
    return response;
  };
  try {
    assert.equal((await read('acct_owner', job.id)).statusCode, 404, 'simulate delayed list availability');
    const ref = createUploadConfirmationRef(280, job.id);
    const result = await read('acct_owner', job.id, ref);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.audit.status, 'QUEUED');
    assert.equal((await read('acct_other', job.id, ref)).statusCode, 404);
    assert.equal((await read('acct_owner', 'aud_wrong', createUploadConfirmationRef(280, 'aud_wrong'))).statusCode, 404);
    job.status = 'DELETED';
    issue.body = `<!-- AO_PLC_AUDIT_B64:${Buffer.from(JSON.stringify(job)).toString('base64')} -->`;
    assert.equal((await read('acct_owner', job.id, ref)).statusCode, 404);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

const source = await readFile(new URL('../plc-audit.js', import.meta.url), 'utf8');
function page(responses, storageUnavailable = false) {
  const root = { innerHTML: '' }, timers = [], urls = [], storage = new Map();
  const context = vm.createContext({
    URLSearchParams, console,
    location: { pathname: '/plc-audit/audits/aud_new', search: '' },
    document: { getElementById: id => id === 'auditRoot' ? root : null, addEventListener() {} },
    sessionStorage: { getItem: key => { if (storageUnavailable) throw Error('Disabled'); return storage.get(key); }, setItem: (key, value) => storage.set(key, value) },
    setTimeout: callback => timers.push(callback),
    fetch: async url => { urls.push(url); const next = responses.shift(); assert.ok(next, 'unexpected extra request'); return Response.json(next.body, { status: next.status || 200 }); },
  });
  vm.runInContext(source, context);
  return { context, root, timers, urls, storage };
}
const audit = status => ({ audit: { id: 'aud_new', filename: 'new.zip', status, snapshotResult: status === 'REVIEW_REQUIRED' ? { project: { projectName: 'Retained partial result' }, maintenanceSummary: { headline: 'Review partial result' } } : null } });
test('result page recovers from delayed availability and updates queued analysis automatically', async () => {
  const p = page([
    { status: 404, body: { code: 'AUDIT_NOT_FOUND', error: 'Audit not found' } },
    { body: audit('QUEUED') }, { body: audit('ANALYSING') }, { body: audit('REVIEW_REQUIRED') },
  ]);
  await p.context.initAudit();
  assert.match(p.root.innerHTML, /Preparing your audit/);
  await p.timers.shift()();
  assert.match(p.root.innerHTML, /QUEUED/);
  await p.timers.shift()();
  assert.match(p.root.innerHTML, /ANALYSING/);
  await p.timers.shift()();
  assert.match(p.root.innerHTML, /Retained partial result/);
  assert.equal(p.timers.length, 0, 'terminal result stops polling');
});
test('saved upload locator reaches the API and disabled browser storage still allows reads', async () => {
  const p = page([{ body: audit('COMPLETE') }]);
  p.context.rememberAuditRef('aud_new', 'record-reference');
  await p.context.initAudit();
  assert.equal(new URL(p.urls[0], 'http://local').searchParams.get('confirmationRef'), 'record-reference');
  const disabled = page([{ body: audit('COMPLETE') }], true);
  await disabled.context.initAudit();
  assert.match(disabled.root.innerHTML, /COMPLETE/);
});
test('not-found retries are bounded and session errors do not retry', async () => {
  const p = page(Array.from({ length: 11 }, () => ({ status: 404, body: { code: 'AUDIT_NOT_FOUND', error: 'Audit not found' } })));
  await p.context.initAudit();
  while (p.timers.length) await p.timers.shift()();
  assert.equal(p.urls.length, 11);
  assert.match(p.root.innerHTML, /Audit not found/);
  const denied = page([{ status: 401, body: { code: 'PLC_SESSION_REQUIRED', error: 'Customer session required' } }]);
  await denied.context.initAudit();
  assert.equal(denied.timers.length, 0);
  assert.match(denied.root.innerHTML, /Customer session required/);
});
