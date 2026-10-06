import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditJob, createWorkerClaim, getCustomerAudit, publishWorkerResult } from '../lib/plc-audit-service.mjs';
import { createMockSnapshotResult } from '../lib/plc-audit-model.mjs';

// Exercise the actual service and persisted Issue records, with GitHub transport isolated.
test('worker publication retains partial evidence and protects active claims', async (t) => {
  const oldFetch = globalThis.fetch;
  const original = Object.fromEntries(['AO_GITHUB_TOKEN', 'AO_PLC_WORKER_KEY'].map(key => [key, process.env[key]]));
  process.env.AO_GITHUB_TOKEN = 'local-test-token';
  process.env.AO_PLC_WORKER_KEY = 'local-test-worker-key';
  let issue;
  let updates = 0;
  const record = () => JSON.parse(Buffer.from(issue.body.match(/AO_PLC_AUDIT_B64:([A-Za-z0-9+/=]+)/)[1], 'base64'));
  const seed = (leaseMs = 60_000) => {
    const job = buildAuditJob({ accountId: 'acct_owner', filename: 'partial.ap14', storagePath: 'plc-audits/test/project.ap14' });
    const claim = createWorkerClaim();
    job.status = 'ANALYSING';
    job.workerClaim = { ...claim.persisted, leaseUntil: new Date(Date.now() + leaseMs).toISOString() };
    issue = { number: 1, state: 'open', body: `<!-- AO_PLC_AUDIT_B64:${Buffer.from(JSON.stringify(job)).toString('base64')} -->` };
    updates = 0;
    return { job, claim, input: { id: job.id, claimToken: claim.token, status: 'REVIEW_REQUIRED' } };
  };
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(String(url).startsWith('https://api.github.com/repos/'));
    if (options.method === 'PATCH') {
      issue = { ...issue, ...JSON.parse(options.body) };
      updates += 1;
      return Response.json(issue);
    }
    return Response.json([issue]);
  };
  try {
    await t.test('valid partial Snapshot is saved and visible to its owner', async () => {
      const { job, input } = seed();
      const snapshot = createMockSnapshotResult(job, 'test/partial');
      snapshot.project.platform = 'Siemens TIA Portal';
      snapshot.project.projectVersion = '14.0.0.0';
      snapshot.analysisCoveragePercent = 0;
      await publishWorkerResult('local-test-worker-key', { ...input, snapshotResult: snapshot });
      const saved = record();
      assert.equal(saved.status, 'REVIEW_REQUIRED');
      assert.equal(saved.detectedPlatform, snapshot.project.platform);
      assert.equal(saved.detectedProjectVersion, snapshot.project.projectVersion);
      assert.equal(saved.engineVersion, 'test/partial');
      assert.ok(saved.completedAt);
      assert.equal(saved.error, null);
      assert.equal(saved.workerClaim, undefined);
      assert.deepEqual((await getCustomerAudit('acct_owner', job.id)).snapshotResult, snapshot);
      await assert.rejects(getCustomerAudit('acct_other', job.id), error => error.status === 404);
      assert.equal(updates, 1);
    });
    await t.test('invalid partial Snapshot leaves the lease active and is not persisted', async () => {
      const { input } = seed();
      await assert.rejects(publishWorkerResult('local-test-worker-key', { ...input, snapshotResult: { blockCount: -1 } }), error => error.status === 422);
      assert.equal(record().status, 'ANALYSING');
      assert.ok(record().workerClaim);
      assert.equal(updates, 0);
    });
    await t.test('unsupported input can request review without a Snapshot', async () => {
      const { input } = seed();
      await publishWorkerResult('local-test-worker-key', input);
      assert.equal(record().status, 'REVIEW_REQUIRED');
      assert.equal(record().snapshotResult, null);
      assert.ok(record().completedAt);
    });
    await t.test('wrong key, stale token and expired claim cannot save a partial result', async () => {
      const { input } = seed();
      await assert.rejects(publishWorkerResult('wrong-key', input), error => error.status === 401);
      await assert.rejects(publishWorkerResult('local-test-worker-key', { ...input, claimToken: 'stale' }), error => error.status === 409);
      const expired = seed(-1000);
      await assert.rejects(publishWorkerResult('local-test-worker-key', expired.input), error => error.status === 409);
      assert.equal(updates, 0);
    });
    await t.test('complete and failure results retain their existing behavior', async () => {
      const { job, input } = seed();
      const snapshot = createMockSnapshotResult(job, 'test/complete');
      await publishWorkerResult('local-test-worker-key', { ...input, status: 'COMPLETE', snapshotResult: snapshot });
      assert.equal(record().status, 'COMPLETE');
      assert.deepEqual(record().snapshotResult, snapshot);
      const failed = seed();
      await publishWorkerResult('local-test-worker-key', { ...failed.input, status: 'FAILED', error: { code: 'TEST_FAILED', message: 'Test failure' } });
      assert.equal(record().status, 'FAILED');
      assert.equal(record().error.code, 'TEST_FAILED');
    });
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
