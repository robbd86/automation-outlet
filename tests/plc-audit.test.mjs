import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSessionToken, verifySessionToken, authorizeJob } from '../lib/plc-audit-auth.mjs';
import { originAllowed } from '../lib/plc-audit-handler.mjs';
import { validateSnapshotResult } from '../lib/plc-audit-model.mjs';
import { assertAccessibleJob, assertJobStatus, assertWorkerClaim, createWorkerClaim, validateUploadRequest } from '../lib/plc-audit-service.mjs';
import { isWorkerClaimable } from '../lib/plc-audit-store.mjs';
import { presignIssuedPermission } from '../lib/plc-audit-blob.mjs';

const originalSecret = process.env.AO_PLC_SESSION_SECRET;
const originalAllowedOrigin = process.env.AO_ALLOWED_ORIGIN;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalWorkerLeaseSeconds = process.env.AO_PLC_WORKER_LEASE_SECONDS;
process.env.AO_PLC_SESSION_SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';

test.after(() => {
  if (originalSecret === undefined) delete process.env.AO_PLC_SESSION_SECRET;
  else process.env.AO_PLC_SESSION_SECRET = originalSecret;
  if (originalAllowedOrigin === undefined) delete process.env.AO_ALLOWED_ORIGIN;
  else process.env.AO_ALLOWED_ORIGIN = originalAllowedOrigin;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalWorkerLeaseSeconds === undefined) delete process.env.AO_PLC_WORKER_LEASE_SECONDS;
  else process.env.AO_PLC_WORKER_LEASE_SECONDS = originalWorkerLeaseSeconds;
});

test('customer session tokens authenticate an opaque account and reject tampering', () => {
  const { token, payload } = issueSessionToken('acct_1234567890abcdef');
  assert.equal(verifySessionToken(token)?.accountId, payload.accountId);
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`), null);
});

test('job ownership is enforced and URL id guessing cannot cross accounts', () => {
  const job = { id: 'aud_1', accountId: 'acct_owner', status: 'COMPLETE' };
  assert.equal(authorizeJob(job, 'acct_owner').id, 'aud_1');
  assert.throws(() => assertAccessibleJob(job, 'acct_other'), (error) => error.status === 404 && error.code === 'AUDIT_NOT_FOUND');
});

test('SnapshotResult validates typed engineering metrics and confidence', () => {
  const result = validateSnapshotResult({
    project: { platform: 'Siemens TIA Portal', projectVersion: 'V18', projectName: 'Line 1' },
    controller: { family: 'S7-1500', model: 'CPU', orderNumber: '', firmware: '' },
    blockCount: 12,
    networkCount: 84,
    callCount: 61,
    writeCount: 43,
    multipleWriterCount: 2,
    investigationCount: 4,
    analysisCoveragePercent: 88.4,
    supportedAreas: ['Code inventory'],
    unsupportedAreas: ['Live machine state'],
    topFindings: [{ id: 'f1', severity: 'ATTENTION', title: 'Review writers', summary: 'Two writers detected.', confidence: 'VERIFIED', evidence: ['DB1.DBX0.0'] }],
    evidenceConfidence: 'VERIFIED',
    engineVersion: 'engine/1.0',
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.multipleWriterCount, 2);

  const invalid = validateSnapshotResult({ blockCount: -1, evidenceConfidence: 'CERTAIN' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 2);
});

test('upload request allows PLC project formats and normalises MIME type', () => {
  const upload = validateUploadRequest({ filename: 'machine.ap14', contentType: '', size: 1024 });
  assert.equal(upload.extension, 'ap14');
  assert.equal(upload.contentType, 'application/octet-stream');
});

test('invalid upload type is rejected before any signed permission is issued', () => {
  assert.throws(
    () => validateUploadRequest({ filename: 'passwords.txt', contentType: 'text/plain', size: 100 }),
    (error) => error.status === 415 && error.code === 'INVALID_UPLOAD_TYPE',
  );
});

test('upload API rejects foreign origins and accepts the requesting site by default', () => {
  delete process.env.AO_ALLOWED_ORIGIN;
  delete process.env.VERCEL_ENV;
  assert.equal(originAllowed({ headers: { origin: 'https://www.automation-outlet.co.uk', host: 'www.automation-outlet.co.uk' } }), true);
  assert.equal(originAllowed({ headers: { origin: 'https://attacker.example', host: 'www.automation-outlet.co.uk' } }), false);
  assert.equal(originAllowed({ headers: { origin: 'not a url', host: 'www.automation-outlet.co.uk' } }), false);
});

test('signed upload permission cannot be reused for another object pathname', () => {
  const scope = Buffer.from(JSON.stringify({
    storeId: 'store_teststore', pathname: 'plc-audits/aud_x/file.ap14', operations: ['put'], validUntil: Date.now() + 60_000,
  })).toString('base64url');
  const issued = { delegationToken: `${scope}.server-signature`, clientSigningToken: 'client-secret' };
  assert.throws(
    () => presignIssuedPermission(issued, { pathname: 'plc-audits/aud_y/file.ap14', operation: 'put' }),
    (error) => error.status === 403 && error.code === 'BLOB_SCOPE_MISMATCH',
  );
});

test('expired signed upload permission is rejected', () => {
  const scope = Buffer.from(JSON.stringify({
    storeId: 'store_teststore', pathname: 'plc-audits/aud_x/file.ap14', operations: ['put'], validUntil: Date.now() - 1000,
  })).toString('base64url');
  const issued = { delegationToken: `${scope}.server-signature`, clientSigningToken: 'client-secret' };
  assert.throws(
    () => presignIssuedPermission(issued, { pathname: 'plc-audits/aud_x/file.ap14', operation: 'put' }),
    (error) => error.status === 403 && error.code === 'BLOB_PERMISSION_EXPIRED',
  );
});

test('audit status handling rejects illegal transitions', () => {
  assert.equal(assertJobStatus({ status: 'QUEUED' }, ['QUEUED', 'ANALYSING']).status, 'QUEUED');
  assert.throws(() => assertJobStatus({ status: 'COMPLETE' }, ['QUEUED']), (error) => error.status === 409 && error.code === 'INVALID_AUDIT_STATUS');
});

test('worker claims are lease-bound and stale workers cannot publish', () => {
  process.env.AO_PLC_WORKER_LEASE_SECONDS = '120';
  const now = Date.parse('2026-10-06T07:00:00.000Z');
  const claim = createWorkerClaim(now);
  const job = { id: 'aud_claimed', status: 'ANALYSING', workerClaim: claim.persisted };

  assert.equal(assertWorkerClaim(job, claim.token, now + 30_000).id, 'aud_claimed');
  assert.throws(
    () => assertWorkerClaim(job, 'older-worker-token', now + 30_000),
    (error) => error.status === 409 && error.code === 'WORKER_CLAIM_STALE',
  );
  assert.throws(
    () => assertWorkerClaim(job, claim.token, now + 121_000),
    (error) => error.status === 409 && error.code === 'WORKER_CLAIM_EXPIRED',
  );
});

test('expired analysing leases become claimable while active leases do not', () => {
  const now = Date.parse('2026-10-06T07:00:00.000Z');
  assert.equal(isWorkerClaimable({ status: 'QUEUED' }, now), true);
  assert.equal(isWorkerClaimable({ status: 'COMPLETE' }, now), false);
  assert.equal(isWorkerClaimable({ status: 'ANALYSING', workerClaim: { leaseUntil: '2026-10-06T06:59:59.000Z' } }, now), true);
  assert.equal(isWorkerClaimable({ status: 'ANALYSING', workerClaim: { leaseUntil: '2026-10-06T07:05:00.000Z' } }, now), false);
  assert.equal(isWorkerClaimable({ status: 'ANALYSING' }, now), false);
});

test('deleted audits are inaccessible to the original owner', () => {
  const deleted = { id: 'aud_deleted', accountId: 'acct_owner', status: 'DELETED' };
  assert.throws(() => authorizeJob(deleted, 'acct_owner'), (error) => error.status === 404 && error.code === 'AUDIT_NOT_FOUND');
});
