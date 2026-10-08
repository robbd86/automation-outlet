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

function optionalCount(value) {
  if (value === null || value === undefined || value === '') return null;
  return finiteCount(value);
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
  // New inventory-only adapters must explicitly declare unperformed checks.
  // Legacy integer counts retain their contract; missing counts remain invalid.
  const allowedUnassessed = ['networkCount', 'callCount', 'writeCount', 'multipleWriterCount'];
  const unassessed = value.unassessedCounts === undefined ? [] : value.unassessedCounts;
  if (!Array.isArray(unassessed) || unassessed.length > allowedUnassessed.length
      || unassessed.some(key => !allowedUnassessed.includes(key)) || new Set(unassessed).size !== unassessed.length) {
    errors.push('unassessedCounts must be a unique list of supported count fields');
  }
  const counts = {};
  if (value.instructionCount !== undefined) {
    if (!Number.isSafeInteger(value.instructionCount) || value.instructionCount < 0) {
      errors.push('instructionCount must be a non-negative safe integer');
    } else counts.instructionCount = value.instructionCount;
  }
  for (const key of requiredCounts) {
    if (Array.isArray(unassessed) && unassessed.includes(key)) {
      if (value[key] !== null) errors.push(`${key} must be null when declared unassessed`);
      counts[key] = null;
      continue;
    }
    if (value[key] === null || value[key] === undefined) {
      errors.push(`${key} must be a non-negative integer or explicitly declared unassessed`);
      continue;
    }
    const n = finiteCount(value[key]);
    if (n === null) errors.push(`${key} must be a non-negative integer`);
    else counts[key] = n;
  }

  const coverage = finitePercent(value.analysisCoveragePercent);
  if (coverage === null) errors.push('analysisCoveragePercent must be between 0 and 100');

  const controller = value.controller && typeof value.controller === 'object' ? value.controller : {};
  const project = value.project && typeof value.project === 'object' ? value.project : {};
  const hardware = value.hardwareSummary && typeof value.hardwareSummary === 'object' ? value.hardwareSummary : {};
  const program = value.programBreakdown && typeof value.programBreakdown === 'object' ? value.programBreakdown : {};
  const maintenance = value.maintenanceSummary && typeof value.maintenanceSummary === 'object' ? value.maintenanceSummary : {};
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

  const maintenanceConfidence = cleanString(maintenance.confidence, 20).toUpperCase();
  // Optional future parser evidence. Legacy workers supply no asset assessment,
  // so missing records remain missing rather than being normalised to absence.
  const backupEvidence = {};
  if (value.backupEvidence !== undefined) {
    if (!value.backupEvidence || typeof value.backupEvidence !== 'object' || Array.isArray(value.backupEvidence)) {
      errors.push('backupEvidence must be an object');
    } else for (const key of ['hmiBackup', 'driveParameterBackup']) {
      const record = value.backupEvidence[key];
      if (record === undefined) continue;
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        errors.push(`backupEvidence.${key} must be an object`);
        continue;
      }
      if (typeof record.assessed !== 'boolean') errors.push(`backupEvidence.${key}.assessed must be a boolean`);
      if (typeof record.scopeComplete !== 'boolean') errors.push(`backupEvidence.${key}.scopeComplete must be a boolean`);
      if (record.scope !== 'ANALYSED_EVIDENCE') errors.push(`backupEvidence.${key}.scope must be ANALYSED_EVIDENCE`);
      if (!['PRESENT', 'ABSENT', 'UNKNOWN'].includes(record.presence)) errors.push(`backupEvidence.${key}.presence is invalid`);
      if (!EVIDENCE_CONFIDENCE.includes(record.confidence)) errors.push(`backupEvidence.${key}.confidence is invalid`);
      const evidence = cleanStringArray(record.evidence, 20, 500);
      if (!Array.isArray(record.evidence)) errors.push(`backupEvidence.${key}.evidence must be an array`);
      if (record.assessed === true && record.confidence === 'VERIFIED' && record.presence !== 'UNKNOWN' && !evidence.length) {
        errors.push(`backupEvidence.${key} verified presence/absence requires evidence`);
      }
      backupEvidence[key] = { assessed: record.assessed === true, scopeComplete: record.scopeComplete === true,
        scope: 'ANALYSED_EVIDENCE', presence: record.presence, confidence: record.confidence, evidence };
    }
  }
  const normalised = {
    schemaVersion: 2,
    project: {
      platform: cleanString(project.platform, 120),
      engineeringSoftware: cleanString(project.engineeringSoftware, 160),
      projectVersion: cleanString(project.projectVersion, 120),
      projectName: cleanString(project.projectName, 180),
    },
    controller: {
      manufacturer: cleanString(controller.manufacturer, 120),
      family: cleanString(controller.family, 120),
      model: cleanString(controller.model, 160),
      orderNumber: cleanString(controller.orderNumber, 160),
      firmware: cleanString(controller.firmware, 120),
      safetyType: cleanString(controller.safetyType, 80),
      ...(controller.configuredType !== undefined ? { configuredType: cleanString(controller.configuredType, 120) } : {}),
    },
    programBreakdown: {
      organisationBlocks: optionalCount(program.organisationBlocks),
      functionBlocks: optionalCount(program.functionBlocks),
      functions: optionalCount(program.functions),
      dataBlocks: optionalCount(program.dataBlocks),
      safetyBlocks: optionalCount(program.safetyBlocks),
    },
    hardwareSummary: {
      configuredIoPoints: optionalCount(hardware.configuredIoPoints),
      digitalInputs: optionalCount(hardware.digitalInputs),
      digitalOutputs: optionalCount(hardware.digitalOutputs),
      analogueInputs: optionalCount(hardware.analogueInputs),
      analogueOutputs: optionalCount(hardware.analogueOutputs),
      remoteIoStations: optionalCount(hardware.remoteIoStations),
      networkDevices: optionalCount(hardware.networkDevices),
      communications: cleanStringArray(hardware.communications, 20, 100),
      ioMappingStatus: cleanString(hardware.ioMappingStatus, 120),
    },
    maintenanceSummary: {
      headline: cleanString(maintenance.headline, 300),
      lifecycle: cleanString(maintenance.lifecycle, 80),
      priority: cleanString(maintenance.priority, 40),
      managerPoints: cleanStringArray(maintenance.managerPoints, 8, 500),
      recommendedActions: cleanStringArray(maintenance.recommendedActions, 8, 500),
      confidence: EVIDENCE_CONFIDENCE.includes(maintenanceConfidence) ? maintenanceConfidence : 'UNKNOWN',
    },
    ...counts,
    ...(value.unassessedCounts !== undefined ? { unassessedCounts: Array.isArray(unassessed) ? [...unassessed] : [] } : {}),
    analysisCoveragePercent: coverage ?? 0,
    supportedAreas: cleanStringArray(value.supportedAreas, 100, 200),
    unsupportedAreas: cleanStringArray(value.unsupportedAreas, 100, 200),
    topFindings: cleanFindings,
    evidenceConfidence: EVIDENCE_CONFIDENCE.includes(confidence) ? confidence : 'UNKNOWN',
    engineVersion: cleanString(value.engineVersion, 120),
    generatedAt: cleanString(value.generatedAt, 80) || new Date().toISOString(),
    ...(value.backupEvidence !== undefined ? { backupEvidence } : {}),
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
  const manufacturerByExt = {
    s7p: 'Siemens', ap13: 'Siemens', ap14: 'Siemens', ap15: 'Siemens', ap16: 'Siemens', ap17: 'Siemens', ap18: 'Siemens', ap19: 'Siemens', ap20: 'Siemens',
    zap13: 'Siemens', zap14: 'Siemens', zap15: 'Siemens', zap16: 'Siemens', zap17: 'Siemens', zap18: 'Siemens', zap19: 'Siemens', zap20: 'Siemens',
    gxw: 'Mitsubishi Electric', gx3: 'Mitsubishi Electric', cxp: 'Omron', smc2: 'Omron', acd: 'Rockwell Automation / Allen-Bradley', l5x: 'Rockwell Automation / Allen-Bradley',
  };
  const platform = platformByExt[ext] || 'Platform detection required';
  const manufacturer = manufacturerByExt[ext] || '';

  return assertSnapshotResult({
    project: {
      platform,
      engineeringSoftware: ext === 'zip' ? 'Detection pending real analysis engine' : platform,
      projectVersion: 'Detection pending real analysis engine',
      projectName: '',
    },
    controller: {
      manufacturer,
      family: '',
      model: '',
      orderNumber: '',
      firmware: '',
      safetyType: '',
    },
    programBreakdown: {},
    hardwareSummary: {
      communications: [],
      ioMappingStatus: 'Not assessed by the website mock adapter',
    },
    maintenanceSummary: {
      headline: 'The secure website workflow is working; detailed PLC identity and maintenance conclusions require the real Python analysis engine.',
      lifecycle: 'Not yet assessed',
      priority: 'ENGINE REVIEW',
      managerPoints: [
        'The uploaded project has passed through the secure Snapshot workflow successfully.',
        'Controller model, hardware, I/O and communications are intentionally not guessed by the website mock adapter.',
        'The next integration step is to feed this result page from the real AO PLC analysis engine.',
      ],
      recommendedActions: ['Connect the real Python analysis worker before using Snapshot findings for maintenance decisions.'],
      confidence: 'UNKNOWN',
    },
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
