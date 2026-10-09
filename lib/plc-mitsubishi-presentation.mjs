// Presentation of existing observations only; no new parsing or scope inference.
export function mitsubishiPresentation(snapshot) {
  if (snapshot?.project?.platform !== 'Mitsubishi GX Works2') return null;
  const decoded = Number.isInteger(snapshot.instructionCount) && snapshot.instructionCount > 0
    && snapshot.supportedAreas?.includes('Decoded Mitsubishi instruction inventory');
  const writeScope = decoded && snapshot.supportedAreas?.includes('Detected source write sites');
  const unassessed = new Set(snapshot.unassessedCounts || []);
  // Current Mitsubishi adapters do not assess visual networks or call/control flow.
  // Historical zero placeholders must not look like assessed absence.
  unassessed.add('networkCount');
  unassessed.add('callCount');
  if (!writeScope) {
    unassessed.add('writeCount');
    unassessed.add('multipleWriterCount');
  }
  return { scope: { status: decoded ? 'PARTIAL' : 'LIMITED',
    explanation: decoded
      ? 'Supported instructions, source metrics and static write observations have been analysed. Visual rung boundaries, call/control flow and unsupported semantics remain unassessed. No defensible whole-project coverage denominator is available.'
      : 'Project inventory and supported identity evidence are available. Native instruction, call/control-flow and visual rung analysis are not established. No defensible whole-project coverage denominator is available.' },
    unassessedCounts: [...unassessed] };
}
