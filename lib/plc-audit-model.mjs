import crypto from 'node:crypto';

export const AUDIT_STATUSES = Object.freeze([
  'CREATED',
  'UPLOADING',
  'QUEUED',
  'ANALYSING',
  'REVIEW_REQUIRED',
  'COMPLETE',
  'FAILED',
  'DELETED',
]);

export const AUDIT_PROFILES = Object.freeze([
  'SNAPSHOT',
  'SMALL_AUDIT',
  'FULL_AUDIT',
  'MODERNISATION_DISCOVERY',
]);

export const EVIDENCE_CONFIDENCE = Object.freeze(['VERIFIED', 'INFERRED', 'UNKNOWN']);

export function isAuditStatus(value) {
  return AUDIT_STATUSES.includes(String(value || '').toUpperCase());
}

export function normaliseProfile(value) {
  const candidate = String(value || 'SNAPSHOT').toUpperCase();
  return AUDIT_PROFILES.includes(candidate) ? candidate : 'SNAPSHOT';
}

function finiteCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function finitePercent(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null;
}

function cleanString(value, max = 300) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, max) : '';
}

function cleanStringArray(value, maxItems = 100, maxLen = 300) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => cleanString(item, maxLen)).filter(Boolean);
}

export function validateSnapshotResult(input) {
  const errors = [];
  const value = input && typeof input === 'object' ? input : {};

  const confidence = cleanString(value.evidenceConfidence, 20).toUpperCase();
  if (!EVIDENCE_CONFIDENCE.includes(confidence)) {
    errors.push('evidenceConfidence must be VERIFIED, INFERRED or UNKNOWN');
  }

  const requiredCounts = ['blockCount', 'networkCount', 'callCount', 'writeCount', 'multipleWriterCount', 'investigationCount'];
  const counts = {};
  for (const key of requiredCounts) {
    const n = finiteCount(value[key]);
    if (n === null) errors.push(`${key} must be a non-negative integer`);
    else counts[key] = n;
  }

  const coverage = finitePercent(value.analysisCoveragePercent);
  if (coverage === null) errors.push('analysisCoveragePercent must be between 0 and 100');

  const controller = value.controller && typeof value.controller === 'object' ? value.controller : {};
  const project = value.project && typeof value.project === 'object' ? value.project : {};
  const findings = Array.isArray(value.topFindings) ? value.topFindings : [];
  const cleanFindings = findings.slice(0, 25).map((finding, index) => {
    if (!finding || typeof finding !== 'object') {
      errors.push(`topFindings[${index}] must be an object`);
      return null;
    }
    const findingConfidence = cleanString(finding.confidence, 20).toUpperCase();
    if (!EVIDENCE_CONFIDENCE.includes(findingConfidence)) {
      errors.push(`topFindings[${index}].confidence is invalid`);
    }
    const severity = cleanString(finding.severity, 20).toUpperCase() || 'INFO';
    const title = cleanString(finding.title, 200);
    const summary = cleanString(finding.summary, 1200);
    if (!title) errors.push(`topFindings[${index}].title is required`);
    return {
      id: cleanString(finding.id, 100) || `finding-${index + 1}`,
      severity,
      title,
      summary,
      confidence: EVIDENCE_CONFIDENCE.includes(findingConfidence) ? findingConfidence : 'UNKNOWN',
      evidence: cleanStringArray(finding.evidence, 20, 500),
    };
  }).filter(Boolean);

  const normalised = {
    schemaVersion: 1,
    project: {
      platform: cleanString(project.platform, 120),
      projectVersion: cleanString(project.projectVersion, 120),
      projectName: cleanString(project.projectName, 180),
    },
    controller: {
      family: cleanString(controller.family, 120),
      model: cleanString(controller.model, 160),
      orderNumber: cleanString(controller.orderNumber, 160),
      firmware: cleanString(controller.firmware, 120),
    },
    ...counts,
    analysisCoveragePercent: coverage ?? 0,
    supportedAreas: cleanStringArray(value.supportedAreas, 100, 200),
    unsupportedAreas: cleanStringArray(value.unsupportedAreas, 100, 200),
    topFindings: cleanFindings,
    evidenceConfidence: EVIDENCE_CONFIDENCE.includes(confidence) ? confidence : 'UNKNOWN',
    engineVersion: cleanString(value.engineVersion, 120),
    generatedAt: cleanString(value.generatedAt, 80) || new Date().toISOString(),
  };

  if (!normalised.engineVersion) errors.push('engineVersion is required');
  return { valid: errors.length === 0, errors, value: normalised };
}

export function assertSnapshotResult(input) {
  const result = validateSnapshotResult(input);
  if (!result.valid) {
    const error = new Error(`Invalid SnapshotResult: ${result.errors.join('; ')}`);
    error.code = 'INVALID_SNAPSHOT_RESULT';
    error.status = 422;
    throw error;
  }
  return result.value;
}

export function createMockSnapshotResult(job, engineVersion = 'ao-plc-mock/0.1') {
  const digest = crypto.createHash('sha256').update(String(job?.id || '')).digest();
  const blockCount = 8 + (digest[0] % 52);
  const networkCount = blockCount * (2 + (digest[1] % 5));
  const callCount = networkCount + (digest[2] % 120);
  const writeCount = Math.max(1, Math.floor(networkCount * (0.55 + (digest[3] % 20) / 100)));
  const multipleWriterCount = digest[4] % Math.max(1, Math.min(9, blockCount));
  const investigationCount = 1 + (digest[5] % 8);
  const coverage = 68 + (digest[6] % 29);
  const ext = String(job?.filename || '').toLowerCase().split('.').pop() || '';
  const platformByExt = {
    s7p: 'Siemens STEP 7 Classic', ap13: 'Siemens TIA Portal', ap14: 'Siemens TIA Portal', ap15: 'Siemens TIA Portal', ap16: 'Siemens TIA Portal', ap17: 'Siemens TIA Portal', ap18: 'Siemens TIA Portal', ap19: 'Siemens TIA Portal', ap20: 'Siemens TIA Portal',
    zap13: 'Siemens TIA Portal', zap14: 'Siemens TIA Portal', zap15: 'Siemens TIA Portal', zap16: 'Siemens TIA Portal', zap17: 'Siemens TIA Portal', zap18: 'Siemens TIA Portal', zap19: 'Siemens TIA Portal', zap20: 'Siemens TIA Portal',
    gxw: 'Mitsubishi GX Works', gx3: 'Mitsubishi GX Works3', cxp: 'Omron CX-Programmer', smc2: 'Omron Sysmac Studio', acd: 'Rockwell Studio 5000', l5x: 'Rockwell Logix Designer', zip: 'Archive / platform detection required',
  };
  const platform = platformByExt[ext] || 'Platform detection required';

  return assertSnapshotResult({
    project: { platform, projectVersion: 'Detection pending worker integration', projectName: '' },
    controller: { family: '', model: '', orderNumber: '', firmware: '' },
    blockCount,
    networkCount,
    callCount,
    writeCount,
    multipleWriterCount,
    investigationCount,
    analysisCoveragePercent: coverage,
    supportedAreas: ['Project structure', 'Code inventory', 'Cross-reference counts', 'Writer analysis'],
    unsupportedAreas: ['Live I/O state', 'Machine timing under load', 'Online diagnostics'],
    topFindings: [
      {
        id: 'mock-writers',
        severity: multipleWriterCount ? 'ATTENTION' : 'INFO',
        title: multipleWriterCount ? 'Multiple write locations require review' : 'No multiple-writer condition generated in mock analysis',
        summary: 'Development adapter output only. Replace with the external Python analysis worker before relying on engineering conclusions.',
        confidence: 'INFERRED',
        evidence: ['Generated by the website mock adapter for end-to-end flow testing.'],
      },
      {
        id: 'mock-coverage',
        severity: coverage < 80 ? 'ATTENTION' : 'INFO',
        title: 'Analysis coverage recorded',
        summary: 'Coverage is rendered from the structured result model and is not proof of live machine behaviour.',
        confidence: 'UNKNOWN',
        evidence: [],
      },
    ],
    evidenceConfidence: 'UNKNOWN',
    engineVersion,
    generatedAt: new Date().toISOString(),
  });
}
