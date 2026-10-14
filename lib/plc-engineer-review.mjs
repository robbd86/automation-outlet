// Commercial scope from existing observations only. Never project raw target,
// source, finding title, unsupported-area text or trace into the customer view.
const positive = value => Number.isSafeInteger(value) && value > 0;
const knownConfidence = value => ['VERIFIED','INFERRED'].includes(value);
export function engineerReviewOffer(snapshot, context) {
  const offer = { investigations:[], deliverables:[], teasers:[] };
  if (context.mock || !context.hasAssessableEvidence) return offer;
  const s = snapshot || {}, supported = s.supportedAreas || [];
  const add = (id, title, investigation, confidence='UNKNOWN') => offer.investigations.push({id,title,investigation,
    confidence:knownConfidence(confidence) ? confidence : 'UNKNOWN'});
  const deliver = (id, title) => { if (!offer.deliverables.some(item => item.id === id)) offer.deliverables.push({id,title}); };
  const writeScope = supported.some(label => ['Detected source write sites','Writer analysis'].includes(label));
  const shared = writeScope && positive(context.writerCount);
  const decoded = positive(s.instructionCount) && supported.some(label =>
    ['Decoded Mitsubishi instruction inventory','Decoded Omron instruction inventory'].includes(label));
  const outputs = decoded && positive(s.programStructure?.outputReferences);
  const timers = decoded && positive(s.programStructure?.timerInstructions);
  if (shared) {
    add('shared-writes', `${context.writerCount} shared-write targets`,
      'Classify, rank and trace the reported shared writes, and determine which affect outputs, permissives or sequence conditions.', context.writerConfidence);
    deliver('target-identities','Specific target/address identification');
    deliver('writer-tracing','Shared-writer tracing');
  }
  if (outputs) {
    add('outputs', `${s.programStructure.outputReferences} referenced output addresses`,
      'Identify referenced outputs with complex or shared control and trace the conditions that govern them. Referenced addresses are not a count of installed outputs.', s.evidenceConfidence || 'UNKNOWN');
    deliver('target-identities','Specific target/address identification');
  }
  if (shared || outputs) deliver('output-permissives','Output/permissive investigation');
  if (timers) {
    add('timing', `${s.programStructure.timerInstructions} timer instructions`,
      'Inspect timing logic relevant to sequences and fault recovery. This count includes repeat uses; machine timing requires separate live evidence.', s.evidenceConfidence || 'UNKNOWN');
    deliver('timing-review','Sequence / fault-recovery timing review');
  }
  // References follow the available source format; Mitsubishi visual networks
  // are unassessed and must not be promised as established source locations.
  if (shared || outputs || timers) {
    if (s.project?.platform === 'Mitsubishi GX Works2') deliver('source-references','Program / instruction references');
    else if (s.project?.platform === 'Omron CX-Programmer') deliver('source-references','Program / section / source-rung references');
    else if (positive(s.networkCount) && !s.unassessedCounts?.includes('networkCount')) deliver('source-references','Block/network references');
  }
  if (context.hasGaps) {
    add('unsupported-source','Unsupported analysis areas',
      'Manually review available source outside automated coverage and identify any extra access or evidence needed for unreadable or protected areas.');
    deliver('source-limitations','Manual source review and unresolved evidence gaps');
  }
  if (!context.exactIdentity) {
    add('identity-lifecycle','Controller identity and lifecycle gap',
      'Confirm the exact physical model from the PLC label and reconcile it with the saved project before checking manufacturer lifecycle and availability. Required customer or site evidence is agreed in scope.');
    deliver('identity-lifecycle','Controller identity / lifecycle verification plan');
  } else if (!context.lifecycleFresh || context.lifecycleExposure || context.familyNotice) {
    add('lifecycle','Controller lifecycle and recovery sourcing',
      context.lifecycleExposure || context.familyNotice
        ? 'Review the dated manufacturer information, sourcing implications and recovery options for the configured controller. Replacement compatibility requires its own assessment.'
        : 'Verify current manufacturer status for the configured part and identify sourcing questions to resolve before recovery planning.');
    deliver('identity-lifecycle','Dated lifecycle / sourcing findings');
  }
  if (context.fileAvailable) {
    const backupChecks = context.recoveryChecks.filter(item => ['HMI backup supplied','Drive parameter backup supplied'].includes(item.label));
    const unconfirmed = backupChecks.filter(item => item.status !== 'CONFIRMED').map(item => item.label === 'HMI backup supplied' ? 'HMI backup' : 'drive parameter backup');
    add('recovery','Recovery evidence gaps', unconfirmed.length
      ? `Review ${unconfirmed.join(' and ')} availability, backup currency and the steps needed to confirm the PLC project matches the live controller. Return a recovery-file and verification checklist; site checks are agreed in scope.`
      : 'Review backup currency, recovery procedures and the steps needed to confirm the PLC project matches the live controller. Return a recovery-file and verification checklist; site checks are agreed in scope.');
    deliver('recovery-plan','Recovery-file and verification checklist');
  }
  const networkEvidence = positive(s.hardwareSummary?.networkDevices)
    || s.hardwareSummary?.communications?.some(value => typeof value === 'string' && value.trim());
  if (context.hasNetwork && networkEvidence) {
    add('communications','Configured communications dependencies',
      'Review dependencies shown by the supplied configuration and identify which device or network evidence is needed for the agreed investigation.');
    deliver('communications','Communications dependency findings');
  }
  if (context.hasSafetyEvidence) {
    add('safety-scope','Safety-related evidence requiring specialist scope',
      'Identify safety-related material requiring specialist review and agree its scope. Safety integrity and compliance validation are separate assessments.');
    deliver('safety-scope','Safety evidence and specialist scope requirements');
  }
  if (offer.investigations.length) {
    offer.deliverables.unshift({id:'ranked-findings',title:'Ranked engineering findings'});
    deliver('maintenance','Maintenance implications and recommended actions');
    deliver('conclusion','Written engineering conclusion');
  }
  // A counter alone, mock finding or unknown-confidence record cannot claim
  // hidden detailed evidence. One neutral row represents actual retained source
  // evidence, without implying a priority ranking already exists.
  const retainedWriterEvidence = (s.topFindings || []).some(item => /^writers-/.test(item.id || '')
    && knownConfidence(item.confidence) && Array.isArray(item.evidence)
    && item.evidence.some(value => typeof value === 'string' && value.trim()));
  if (shared && knownConfidence(context.writerConfidence) && retainedWriterEvidence) {
    offer.teasers.push({id:'shared-write-evidence',title:'Shared-write control path — details available in Engineer Review',
      detail:'Source evidence is retained. Engineering priority has not yet been assigned.',confidence:context.writerConfidence});
  }
  return offer;
}
