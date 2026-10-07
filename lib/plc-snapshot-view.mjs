// Free Snapshot projection. Keep source evidence in storage; never send logic traces
// or per-target investigations through the customer Snapshot API.
const count = value => Number.isInteger(value) && value >= 0 ? value : null;
const confidence = value => ['VERIFIED', 'INFERRED', 'UNKNOWN'].includes(value) ? value : 'UNKNOWN';
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const BASE_LIMITS = new Set(['Whole-project completeness', 'Live machine behaviour', 'Configured hardware and I/O',
  'Lifecycle and safety assessment', 'Live I/O state', 'Machine timing under load', 'Online diagnostics']);
const SUPPORTED_LABELS = new Set(['Supplied block inventory', 'Detected source write sites',
  'Supported Boolean conditions with traceable evidence', 'Configured CPU identity with typed project-record evidence',
  'Project structure', 'Code inventory', 'Cross-reference counts', 'Writer analysis']);
const tier = (label, explanation) => ({ label, explanation });
const finding = (id, title, why, evidenceSummary, nextStep, certainty) =>
  ({ id, title, why, evidenceSummary, nextStep, confidence: certainty });

export function deriveSnapshotView(snapshot, { lifecycle = null, status = '', projectAvailable = false } = {}) {
  const s = snapshot || {}, c = s.controller || {}, p = s.project || {}, h = s.hardwareSummary || {}, b = s.programBreakdown || {};
  const sourceFindings = Array.isArray(s.topFindings) ? s.topFindings : [];
  const cpu = sourceFindings.find(item => item.id === 'configured-cpu');
  const cpuConfidence = confidence(cpu?.confidence);
  const writers = sourceFindings.filter(item => /^writers-/.test(item.id || '') || item.id === 'mock-writers');
  const writerConfidence = writers.length && writers.every(item => item.confidence === 'VERIFIED') ? 'VERIFIED'
    : writers.length && writers.every(item => ['VERIFIED', 'INFERRED'].includes(item.confidence)) ? 'INFERRED' : 'UNKNOWN';
  const mock = /^ao-plc-mock\//.test(s.engineVersion || '');
  const writerCount = count(s.multipleWriterCount);
  const hasSharedWrites = !mock && writerCount > 0;
  const reliableSharedWrites = hasSharedWrites && writerConfidence !== 'UNKNOWN';
  const programLimits = (s.unsupportedAreas || []).filter(item => !BASE_LIMITS.has(item));
  const hasSource = !mock && (count(s.blockCount) > 0 || hasText(p.platform) || hasText(c.model));
  const hasAssessableEvidence = !mock && ((count(s.blockCount) > 0 && (s.supportedAreas || []).length > 0)
    || (hasText(c.model) && cpuConfidence !== 'UNKNOWN'));
  const hasGaps = hasSource && (status === 'REVIEW_REQUIRED' || programLimits.length > 0 || s.analysisCoveragePercent < 100);
  const completeWriterScope = !mock && status === 'COMPLETE' && s.analysisCoveragePercent === 100
    && s.evidenceConfidence === 'VERIFIED' && programLimits.length === 0
    && (s.supportedAreas || []).some(item => ['Detected source write sites', 'Writer analysis'].includes(item));
  const lifecycleFresh = ['ACTIVE', 'PHASE_OUT', 'DISCONTINUED'].includes(lifecycle?.status);
  const lifecycleExposure = lifecycleFresh && ['PHASE_OUT', 'DISCONTINUED'].includes(lifecycle.status);
  const familyNotice = Boolean(lifecycle?.familyNotice);
  const exactIdentity = hasText(c.model) && hasText(c.orderNumber) && cpuConfidence !== 'UNKNOWN' && !mock;
  const hasHardware = exactIdentity || count(h.configuredIoPoints) !== null;
  const hasNetwork = (h.communications || []).length > 0 || count(h.networkDevices) !== null;
  const hasSafetyEvidence = hasText(c.safetyType) || count(b.safetyBlocks) > 0;
  const fileAvailable = projectAvailable || Boolean(snapshot);

  let overall = tier('NOT ASSESSED', 'There is not enough supported evidence to assess the supplied controls. Unknown areas require verification; no machine-risk conclusion is made.');
  if (!mock && lifecycleFresh && lifecycle.status === 'DISCONTINUED') {
    overall = tier('HIGH PRIORITY', 'The configured CPU has a verified discontinued manufacturer status. Give recovery and sourcing arrangements priority; replacement compatibility has not been assessed.');
  } else if (reliableSharedWrites || lifecycleExposure) {
    overall = tier('ATTENTION', `${reliableSharedWrites ? 'Shared write locations were detected in the supplied source and may increase fault-finding complexity.' : 'The configured CPU has a verified phase-out status.'} Targeted review is recommended; this is not a finding of a programming fault or machine failure.`);
  } else if (hasAssessableEvidence) {
    overall = tier('REVIEW', hasGaps
      ? 'The supplied project provides useful controls information, but parts of the analysis are incomplete. Verify the recovery evidence and review unsupported areas before relying on this Snapshot.'
      : 'The supplied project provides useful controls information. Its match to the live machine and the completeness of recovery files still need verification.');
  }
  const logic = reliableSharedWrites ? tier('ATTENTION', 'Shared write locations may increase fault-finding complexity; intent and execution order require engineer review.')
    : hasGaps && hasAssessableEvidence ? tier('REVIEW', 'Unsupported or incomplete source analysis limits what can be concluded about maintainability.')
    : completeWriterScope && writerCount === 0 ? tier('LOW CONCERN', 'No shared writes detected within the supported supplied-source scope. This is not a code-quality or live-behaviour conclusion.')
    : tier('NOT ASSESSED', 'No sufficiently supported maintainability assessment is available.');
  const recovery = hasAssessableEvidence ? tier('REVIEW', 'Useful project information is available, but backup currency, live match and recovery procedures have not been verified.')
    : tier('NOT ASSESSED', 'An upload alone does not establish usable or current recovery information.');
  const documentation = tier(hasSource ? 'REVIEW' : 'NOT ASSESSED', hasSource
    ? 'Project evidence is available; HMI backups, drive parameters and wider recovery documentation are not established by this Snapshot.'
    : 'No supported documentation assessment is available from the analysed evidence.');
  const life = tier(lifecycleExposure ? 'ATTENTION' : familyNotice ? 'REVIEW' : lifecycleFresh ? 'LOW CONCERN' : 'NOT ASSESSED',
    lifecycleFresh ? `${lifecycle.manufacturerStatus}. ${familyNotice ? 'A separate manufacturer family notice warrants review of future availability.' : 'Check the dated manufacturer source when making sourcing decisions.'}`
      : lifecycle?.status === 'STALE' ? 'The manufacturer review needs rechecking before relying on its last recorded status.' : 'The exact part has no current verified manufacturer lifecycle record.');

  const identityCheck = (label, value, certainty = 'UNKNOWN') => ({ label,
    status: mock ? 'NOT ASSESSED' : hasText(value) ? certainty === 'VERIFIED' ? 'CONFIRMED' : 'PARTIAL' : 'NOT VERIFIED',
    detail: mock ? 'Development adapter data is not engineering evidence.' : hasText(value) ? `${value} — identified in supplied project${certainty === 'UNKNOWN' ? '; field confidence is not supplied' : ''}.` : 'Not identified in supplied project.',
    confidence: mock ? 'UNKNOWN' : hasText(value) ? certainty : 'UNKNOWN' });
  const checks = [
    { label: 'PLC project available', status: fileAvailable ? 'CONFIRMED' : 'NOT SUPPLIED', detail: fileAvailable ? 'A project file was supplied. Currency and completeness are not verified.' : 'Not supplied in analysed evidence.', confidence: fileAvailable ? 'VERIFIED' : 'UNKNOWN' },
    identityCheck('Manufacturer identified', c.manufacturer, cpuConfidence),
    identityCheck('PLC family identified', c.family, cpuConfidence),
    identityCheck('Exact CPU identified', c.model, cpuConfidence),
    identityCheck('CPU order number identified', c.orderNumber, cpuConfidence),
    identityCheck('Configured firmware identified', c.firmware, cpuConfidence),
    identityCheck('Engineering software identified', p.engineeringSoftware),
    { label: 'Hardware configuration identifiable', status: !mock && hasHardware ? 'PARTIAL' : 'NOT ASSESSED', detail: !mock && hasHardware ? 'Some configured controller or I/O evidence is available; full hardware configuration has not been verified.' : 'No supported hardware configuration assessment is available.', confidence: 'UNKNOWN' },
    { label: 'Network configuration identifiable', status: !mock && hasNetwork ? 'PARTIAL' : 'NOT ASSESSED', detail: !mock && hasNetwork ? 'Communications or device evidence is available; full network configuration has not been verified.' : 'Network configuration not identified in analysed evidence.', confidence: 'UNKNOWN' },
    { label: 'Safety project / logic identifiable', status: !mock && hasSafetyEvidence ? 'PARTIAL' : 'NOT ASSESSED', detail: !mock && hasSafetyEvidence ? 'Configured safety-related evidence is present; safety integrity and operation have not been assessed.' : 'Safety project and logic have not been assessed.', confidence: 'UNKNOWN' },
    ...['HMI backup supplied', 'Drive parameter backup supplied'].map(label => ({ label, status: 'NOT SUPPLIED', detail: 'Not supplied in analysed evidence. The Snapshot does not establish whether a backup exists elsewhere or in unanalysed files.', confidence: 'UNKNOWN' })),
    { label: 'Project verified against live PLC', status: 'NOT VERIFIED', detail: 'No live controller comparison was performed.', confidence: 'UNKNOWN' },
    { label: 'Replacement controller strategy assessed', status: 'NOT ASSESSED', detail: 'Replacement compatibility and recovery planning require engineering review.', confidence: 'UNKNOWN' },
  ];
  const maintenanceImpact = [];
  if (hasSharedWrites) maintenanceImpact.push(`${writerCount} program targets appear to be written from more than one location. This may be intentional, but shared control paths can increase fault-finding complexity. This count covers detected source only.`);
  if (hasGaps) maintenanceImpact.push('Some supplied source remains outside supported analysis. Fault-finding may require specialist knowledge of those areas.');
  if (lifecycleExposure || familyNotice) maintenanceImpact.push('Manufacturer lifecycle information warrants a review of future availability and sourcing arrangements.');
  if (!maintenanceImpact.length) maintenanceImpact.push('No supported maintenance-impact conclusion is available beyond the identified project information.');
  const recoveryImpact = [fileAvailable
    ? 'The supplied project provides potential recovery information, but the Snapshot cannot confirm that it matches the program currently running in the machine.'
    : 'No usable supplied-project recovery evidence has been established.',
    'HMI backups, drive parameters and wider recovery information are not established in the analysed evidence. Confirm what is held for the machine before planning recovery.'];
  const findings = [];
  if (!mock && hasText(c.model)) findings.push(finding('configured-cpu', 'Configured controller identified',
    'Controller identity helps identify the engineering tools and sourcing information to verify for recovery.',
    `${c.model}${hasText(c.orderNumber) ? `; order number ${c.orderNumber}` : '; exact order number not identified'}${hasText(c.firmware) ? `; configured firmware ${c.firmware}` : '; configured firmware not identified'}. Saved project configuration only.`,
    'Confirm the configured identity against installed hardware and the live engineering project.', cpuConfidence));
  if (hasSharedWrites) findings.push(finding('shared-control', 'Multiple shared-write targets detected',
    'Shared control paths can increase fault-finding complexity. Multiple writers are common and do not automatically indicate a programming fault.',
    `${writerCount} affected targets identified during static analysis of supplied source. Full target lists and logic tracing are reserved for Engineer Review.`,
    'Request targeted shared-control review before drawing conclusions about specific outputs, permissives or sequences.', writerConfidence));
  if (hasGaps) findings.push(finding('analysis-scope', 'Source analysis is incomplete',
    'Unsupported areas limit the conclusions that maintenance can draw from automated analysis.',
    `${Number.isFinite(s.analysisCoveragePercent) ? s.analysisCoveragePercent : 0}% supported analysis coverage reported; ${programLimits.length} additional scope limitations recorded. Coverage is not a measure of live-machine condition.`,
    'Have an engineer review unsupported source areas and confirm the available project evidence.', 'UNKNOWN'));
  if (lifecycleExposure || familyNotice) findings.push(finding('lifecycle-review', 'Hardware lifecycle deserves review',
    'Manufacturer availability changes may affect future sourcing and recovery options.',
    lifecycleFresh ? `${lifecycle.manufacturerStatus}, checked ${lifecycle.checkedAt}.${familyNotice ? ' A separate family notice is available; it does not automatically change exact-part status.' : ''}`
      : 'The last manufacturer review needs rechecking; a dated family notice is retained as context.',
    'Review the linked manufacturer sources for this exact order number before making purchasing or replacement decisions.', lifecycleFresh ? 'VERIFIED' : 'UNKNOWN'));
  if (hasSource && findings.length < 5) findings.push(finding('recovery-evidence', 'Recovery evidence is not live-verified',
    'Recovery preparation depends on usable, current files and confirmed machine configuration.',
    'A supplied project is available. No live comparison, complete backup set or replacement compatibility assessment was performed.',
    'Confirm backup currency and the available PLC, HMI and drive recovery files.', 'UNKNOWN'));
  const nextActions = [];
  if (fileAvailable) nextActions.push({ title: 'Verify the supplied project against the live controller', why: 'The Snapshot cannot establish whether the uploaded project is current or matches the machine.' });
  nextActions.push({ title: 'Confirm recovery files for critical controls', why: 'Check the PLC project, HMI backup, drive parameters and required engineering tools before relying on recovery readiness.' });
  if (hasSharedWrites) nextActions.push({ title: 'Review shared control paths', why: 'An engineer can investigate the detected write locations and determine where shared control affects diagnostics.' });
  if (lifecycleExposure || familyNotice || hasText(c.orderNumber)) nextActions.push({ title: 'Review the exact controller lifecycle', why: lifecycleFresh ? 'Use the dated manufacturer sources to confirm availability; a successor family does not prove replacement compatibility.' : 'Verify manufacturer status for the exact order number rather than inferring it from the PLC family or age.' });
  if (hasGaps || !hasSource) nextActions.push({ title: 'Investigate unsupported or unknown analysis areas', why: 'Resolve evidence gaps before using the Snapshot to guide changes or recovery decisions.' });
  const deeperAreas = [];
  if (hasSharedWrites) deeperAreas.push({ title: 'Shared control paths', reason: `${writerCount} detected shared-write targets warrant investigation of intent and execution order.` });
  if (fileAvailable) deeperAreas.push({ title: 'Recovery readiness', reason: 'The supplied project has not been verified against the live controller or a complete recovery file set.' });
  if (hasGaps) deeperAreas.push({ title: 'Unsupported program areas', reason: 'Source limitations prevent complete automated analysis.' });
  if (!mock && hasNetwork) deeperAreas.push({ title: 'Network / communications dependencies', reason: 'Configured communications evidence needs assessment in the machine context.' });
  if (!mock && hasSafetyEvidence) deeperAreas.push({ title: 'Safety-related configuration / logic', reason: 'Safety-related evidence is present; no safety engineering conclusion has been made.' });
  if (lifecycleExposure || familyNotice) deeperAreas.push({ title: 'Hardware lifecycle exposure', reason: 'Dated manufacturer information identifies an availability change or family notice to review.' });
  if (hasSource && !exactIdentity) deeperAreas.push({ title: 'Controller / hardware identity', reason: 'An exact supported CPU identity has not been established.' });
  return {
    schemaVersion: 1, overall, logic, recovery, documentation, lifecycle: life,
    safety: tier('NOT ASSESSED', 'No safety integrity, machine compliance or live safety assessment was performed.'),
    identityConfidence: mock ? 'UNKNOWN' : cpuConfidence,
    sharedControl: { count: mock ? null : writerCount, confidence: mock ? 'UNKNOWN' : hasSharedWrites ? writerConfidence : completeWriterScope && writerCount === 0 ? 'VERIFIED' : 'UNKNOWN',
      explanation: hasSharedWrites ? 'Multiple writers are common in PLC software and do not automatically indicate a programming fault. They are highlighted because shared control paths can make fault diagnosis more complex.' : completeWriterScope && writerCount === 0 ? 'No shared writes detected in the supported supplied-source scope; this does not establish whole-machine behaviour.' : 'Shared-control analysis is not sufficiently established. A zero or missing count is not proof that no shared control exists.' },
    recoveryChecks: checks, maintenanceImpact, recoveryImpact, findings: findings.slice(0, 5),
    nextActions: nextActions.slice(0, 5), deeperAreas, discussModernisation: lifecycleExposure || familyNotice,
    complexity: 'NOT ASSESSED', // No validated size-to-risk or code-quality thresholds.
    mock, programLimitationCount: programLimits.length,
  };
}

export function freeSnapshotResult(snapshot, view) {
  if (!snapshot) return null;
  // Explicit allowlist: adding parser fields cannot silently unlock paid detail.
  const { schemaVersion, project, controller, programBreakdown, hardwareSummary,
    blockCount, networkCount, callCount, writeCount, multipleWriterCount, investigationCount,
    analysisCoveragePercent, evidenceConfidence, engineVersion, generatedAt } = snapshot;
  const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
  const cpu = (snapshot.topFindings || []).find(item => item.id === 'configured-cpu');
  const rawProvenance = (cpu?.evidence || []).join(' ');
  const object = rawProvenance.match(/object\[(\d+)\]/)?.[1];
  const recordHash = rawProvenance.match(/sha256\[([a-f0-9]{64})\]/)?.[1];
  const fileHash = rawProvenance.match(/file sha256 ([a-f0-9]{64})/)?.[1];
  const controllerEvidence = [object ? `Project record object[${object}]` : '', recordHash ? `Record SHA-256 ${recordHash}` : '', fileHash ? `Source file SHA-256 ${fileHash}` : ''].filter(Boolean);
  return { schemaVersion,
    project: pick(project, ['platform', 'engineeringSoftware', 'projectVersion', 'projectName']),
    controller: pick(controller, ['manufacturer', 'family', 'model', 'orderNumber', 'firmware', 'safetyType']),
    programBreakdown: pick(programBreakdown, ['organisationBlocks', 'functionBlocks', 'functions', 'dataBlocks', 'safetyBlocks']),
    hardwareSummary: pick(hardwareSummary, ['configuredIoPoints', 'digitalInputs', 'digitalOutputs', 'analogueInputs', 'analogueOutputs', 'remoteIoStations', 'networkDevices', 'communications', 'ioMappingStatus']),
    controllerEvidence,
    blockCount, networkCount, callCount, writeCount, multipleWriterCount, investigationCount,
    analysisCoveragePercent, evidenceConfidence, engineVersion, generatedAt,
    supportedAreas: [...new Set((snapshot.supportedAreas || []).map(item => SUPPORTED_LABELS.has(item) ? item : 'Additional supported source analysis'))],
    unsupportedAreas: [...new Set((snapshot.unsupportedAreas || []).map(item => BASE_LIMITS.has(item) ? item : 'Program constructs or file formats outside supported analysis'))],
    maintenanceSummary: { headline: view.overall.explanation, lifecycle: snapshot.maintenanceSummary?.lifecycle || 'Not assessed',
      priority: view.overall.label, managerPoints: view.maintenanceImpact, recommendedActions: view.nextActions.map(item => `${item.title}: ${item.why}`),
      confidence: confidence(evidenceConfidence) },
    topFindings: view.findings.map(item => ({ id: item.id, title: item.title, severity: 'INFO',
      summary: item.why, confidence: item.confidence, evidence: [item.evidenceSummary] })),
  };
}
