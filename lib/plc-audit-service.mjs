import crypto from 'node:crypto';
import { authorizeJob } from './plc-audit-auth.mjs';
import { assertSnapshotResult, createMockSnapshotResult, normaliseProfile } from './plc-audit-model.mjs';
import { createAuditJobRecord, getAuditJobRecord, listAuditJobRecordsForAccount, listClaimableAuditJobRecords, updateAuditJobRecord } from './plc-audit-store.mjs';
import { createReadPermission, createUploadPermission, deletePrivateObject } from './plc-audit-blob.mjs';

const ALLOWED_EXTENSIONS = new Set([
  'zip', 's7p', 'ap11', 'ap12', 'ap13', 'ap14', 'ap15', 'ap16', 'ap17', 'ap18', 'ap19', 'ap20',
  'zap13', 'zap14', 'zap15', 'zap16', 'zap17', 'zap18', 'zap19', 'zap20',
  'gxw', 'gx2', 'gx3', 'cxp', 'smc2', 'acd', 'l5x', 'rss', 'prj',
]);

const MIME_TYPES = new Set(['application/octet-stream', 'application/zip', 'application/x-zip-compressed']);
const DEFAULT_WORKER_LEASE_SECONDS = 30 * 60;

function clean(value, max = 300) { return String(value ?? '').replace(/\0/g, '').trim().slice(0, max); }
function nowIso() { return new Date().toISOString(); }

function auditError(message, status = 400, code = 'AUDIT_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function workerLeaseSeconds() {
  const configured = Number.parseInt(process.env.AO_PLC_WORKER_LEASE_SECONDS || '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_WORKER_LEASE_SECONDS;
  return Math.max(60, Math.min(6 * 60 * 60, configured));
}

export function createWorkerClaim(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const leaseUntil = now + workerLeaseSeconds() * 1000;
  return {
    token,
    persisted: {
      tokenHash: tokenHash(token),
      claimedAt: new Date(now).toISOString(),
      leaseUntil: new Date(leaseUntil).toISOString(),
    },
  };
}

export function assertWorkerClaim(job, suppliedToken, now = Date.now()) {
  if (!job || job.status !== 'ANALYSING' || !job.workerClaim?.tokenHash) {
    throw auditError('Audit does not have an active worker claim', 409, 'WORKER_CLAIM_MISSING');
  }
  const leaseUntil = Date.parse(String(job.workerClaim.leaseUntil || ''));
  if (!Number.isFinite(leaseUntil) || leaseUntil <= now) {
    throw auditError('Worker claim has expired', 409, 'WORKER_CLAIM_EXPIRED');
  }
  if (!secureEqual(job.workerClaim.tokenHash, tokenHash(suppliedToken))) {
    throw auditError('Worker claim is no longer current', 409, 'WORKER_CLAIM_STALE');
  }
  return job;
}

export function validateUploadRequest(input) {
  const filename = clean(input?.filename, 240);
  const contentType = clean(input?.contentType || 'application/octet-stream', 120).toLowerCase();
  const size = Number(input?.size);
  const extension = filename.includes('.') ? filename.toLowerCase().split('.').pop() : '';
  const maximum = Math.max(1024 * 1024, Number.parseInt(process.env.AO_PLC_MAX_UPLOAD_BYTES || '', 10) || 250 * 1024 * 1024);
  if (!filename) throw auditError('Project filename is required', 400, 'INVALID_UPLOAD');
  if (!ALLOWED_EXTENSIONS.has(extension)) throw auditError('This PLC project file type is not currently accepted', 415, 'INVALID_UPLOAD_TYPE');
  if (!Number.isFinite(size) || size <= 0 || size > maximum) throw auditError(`Project must be between 1 byte and ${maximum} bytes`, 413, 'INVALID_UPLOAD_SIZE');
  const normalisedContentType = MIME_TYPES.has(contentType) ? contentType : 'application/octet-stream';
  return { filename, extension, contentType: normalisedContentType, size, maximum };
}

function retentionInfo(createdAt) {
  const days = Math.max(1, Math.min(365, Number.parseInt(process.env.AO_PLC_RETENTION_DAYS || '', 10) || 30));
  return {
    policyDays: days,
    deleteAfter: new Date(new Date(createdAt).getTime() + days * 86400000).toISOString(),
    deletionRequestedAt: null,
    deletedAt: null,
    blobDeletedAt: null,
  };
}

export function buildAuditJob({ accountId, filename, profile = 'SNAPSHOT', storagePath, id = `aud_${crypto.randomBytes(16).toString('hex')}` }) {
  const createdAt = nowIso();
  return {
    schema: 1,
    id,
    accountId,
    profile: normaliseProfile(profile),
    status: 'CREATED',
    filename,
    storagePath,
    detectedPlatform: null,
    detectedProjectVersion: null,
    engineVersion: null,
    createdAt,
    startedAt: null,
    completedAt: null,
    snapshotResult: null,
    reportArtifact: null,
    error: null,
    retention: retentionInfo(createdAt),
  };
}

export function assertJobStatus(job, allowed) {
  if (!job || !allowed.includes(job.status)) {
    throw auditError(`Audit is not in an allowed state (${job?.status || 'missing'})`, 409, 'INVALID_AUDIT_STATUS');
  }
  return job;
}

export function assertAccessibleJob(job, accountId) {
  return authorizeJob(job, accountId);
}

export async function createUploadJob({ accountId, input }) {
  const upload = validateUploadRequest(input);
  const id = `aud_${crypto.randomBytes(16).toString('hex')}`;
  const storagePath = `plc-audits/${id}/${crypto.randomBytes(20).toString('hex')}.${upload.extension}`;
  let job = buildAuditJob({ accountId, filename: upload.filename, profile: 'SNAPSHOT', storagePath, id });
  job = await createAuditJobRecord(job);
  try {
    const permission = await createUploadPermission({ pathname: storagePath, maximumSizeInBytes: upload.size, contentType: upload.contentType });
    job.status = 'UPLOADING';
    job.uploadPermissionExpiresAt = permission.expiresAt;
    job = await updateAuditJobRecord(job);
    return { job: publicJob(job), upload: permission };
  } catch (error) {
    job.status = 'FAILED';
    job.error = { code: error.code || 'UPLOAD_PERMISSION_FAILED', message: clean(error.message, 500), at: nowIso() };
    await updateAuditJobRecord(job).catch(() => {});
    throw error;
  }
}

export async function confirmUpload({ accountId, id }) {
  let job = authorizeJob(await getAuditJobRecord(id), accountId);
  assertJobStatus(job, ['UPLOADING']);
  job.status = 'QUEUED';
  delete job.uploadPermissionExpiresAt;
  job = await updateAuditJobRecord(job);
  if (String(process.env.AO_PLC_ANALYSIS_ADAPTER || '').toLowerCase() === 'mock') {
    job = await runMockAnalysis(job);
  }
  return publicJob(job);
}

export async function runMockAnalysis(job) {
  assertJobStatus(job, ['QUEUED', 'ANALYSING']);
  job.status = 'ANALYSING';
  job.startedAt ||= nowIso();
  job.engineVersion = process.env.AO_PLC_MOCK_ENGINE_VERSION || 'ao-plc-mock/0.1';
  job = await updateAuditJobRecord(job);
  const result = createMockSnapshotResult(job, job.engineVersion);
  job.snapshotResult = result;
  job.detectedPlatform = result.project.platform || null;
  job.detectedProjectVersion = result.project.projectVersion || null;
  job.status = 'COMPLETE';
  job.completedAt = nowIso();
  job.error = null;
  delete job.workerClaim;
  return updateAuditJobRecord(job);
}

export async function listCustomerAudits(accountId) {
  const jobs = await listAuditJobRecordsForAccount(accountId);
  return jobs.map(publicJob).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getCustomerAudit(accountId, id) {
  return publicJob(authorizeJob(await getAuditJobRecord(id), accountId));
}

export async function deleteCustomerAudit(accountId, id) {
  let job = authorizeJob(await getAuditJobRecord(id), accountId);
  if (job.status === 'DELETED') throw auditError('Audit not found', 404, 'AUDIT_NOT_FOUND');
  job.retention = { ...(job.retention || {}), deletionRequestedAt: nowIso() };
  try {
    if (job.storagePath) await deletePrivateObject(job.storagePath);
    if (job.reportArtifact?.pathname) await deletePrivateObject(job.reportArtifact.pathname);
    job.retention.blobDeletedAt = nowIso();
  } catch (error) {
    job.error = { code: error.code || 'DELETE_FAILED', message: clean(error.message, 500), at: nowIso() };
    job = await updateAuditJobRecord(job);
    throw error;
  }
  job.status = 'DELETED';
  job.retention.deletedAt = nowIso();
  job.filename = 'Deleted PLC project';
  job.storagePath = null;
  job.detectedPlatform = null;
  job.detectedProjectVersion = null;
  job.engineVersion = null;
  job.startedAt = null;
  job.completedAt = null;
  job.snapshotResult = null;
  job.reportArtifact = null;
  job.error = null;
  delete job.uploadPermissionExpiresAt;
  delete job.workerClaim;
  await updateAuditJobRecord(job);
  return { id, status: 'DELETED' };
}

function requireWorkerKey(supplied) {
  const expected = String(process.env.AO_PLC_WORKER_KEY || '');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(supplied || ''));
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw auditError('Worker authorization failed', 401, 'WORKER_UNAUTHORIZED');
}

export async function getNextWorkerJob(workerKey) {
  requireWorkerKey(workerKey);
  const claimable = await listClaimableAuditJobRecords();
  const job = claimable.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (!job) return null;
  const claim = createWorkerClaim();
  job.status = 'ANALYSING';
  job.startedAt ||= nowIso();
  job.workerClaim = claim.persisted;
  const saved = await updateAuditJobRecord(job);
  const project = await createReadPermission(saved.storagePath, Math.min(workerLeaseSeconds(), 10 * 60) * 1000);
  return {
    job: workerJob(saved),
    projectDownload: project,
    claimToken: claim.token,
    claimExpiresAt: saved.workerClaim.leaseUntil,
  };
}

export async function publishWorkerResult(workerKey, input) {
  requireWorkerKey(workerKey);
  let job = await getAuditJobRecord(clean(input?.id, 100));
  if (!job || job.status === 'DELETED') throw auditError('Audit not found', 404, 'AUDIT_NOT_FOUND');
  assertWorkerClaim(job, input?.claimToken);
  const status = clean(input?.status, 40).toUpperCase();
  if (status === 'COMPLETE') {
    job.snapshotResult = assertSnapshotResult(input?.snapshotResult);
    job.engineVersion = clean(input?.engineVersion || job.snapshotResult.engineVersion, 120);
    job.detectedPlatform = clean(input?.detectedPlatform || job.snapshotResult.project.platform, 160) || null;
    job.detectedProjectVersion = clean(input?.detectedProjectVersion || job.snapshotResult.project.projectVersion, 120) || null;
    job.reportArtifact = input?.reportArtifact?.pathname ? {
      pathname: clean(input.reportArtifact.pathname, 500),
      filename: clean(input.reportArtifact.filename || 'ao-plc-audit-report.pdf', 220),
      contentType: clean(input.reportArtifact.contentType || 'application/pdf', 100),
      createdAt: clean(input.reportArtifact.createdAt, 80) || nowIso(),
    } : null;
    job.status = 'COMPLETE';
    job.completedAt = nowIso();
    job.error = null;
  } else if (status === 'REVIEW_REQUIRED') {
    job.status = 'REVIEW_REQUIRED';
    job.engineVersion = clean(input?.engineVersion, 120) || job.engineVersion;
  } else if (status === 'FAILED') {
    job.status = 'FAILED';
    job.error = { code: clean(input?.error?.code, 120) || 'ANALYSIS_FAILED', message: clean(input?.error?.message, 1000) || 'Analysis failed', at: nowIso() };
  } else {
    throw auditError('Worker status must be COMPLETE, REVIEW_REQUIRED or FAILED', 422, 'INVALID_AUDIT_STATUS');
  }
  delete job.workerClaim;
  return workerJob(await updateAuditJobRecord(job));
}

export async function createReportDownload(accountId, id) {
  const job = authorizeJob(await getAuditJobRecord(id), accountId);
  if (!job.reportArtifact?.pathname) throw auditError('No private report is available for this audit', 404, 'REPORT_NOT_AVAILABLE');
  const permission = await createReadPermission(job.reportArtifact.pathname, 5 * 60 * 1000);
  return { ...permission, filename: job.reportArtifact.filename, contentType: job.reportArtifact.contentType };
}

export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    profile: job.profile,
    status: job.status,
    filename: job.filename,
    detectedPlatform: job.detectedPlatform,
    detectedProjectVersion: job.detectedProjectVersion,
    engineVersion: job.engineVersion,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    snapshotResult: job.snapshotResult,
    reportAvailable: Boolean(job.reportArtifact?.pathname),
    error: job.error,
    retention: job.retention,
  };
}

function workerJob(job) {
  return {
    id: job.id,
    profile: job.profile,
    status: job.status,
    filename: job.filename,
    storagePath: job.storagePath,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
  };
}
