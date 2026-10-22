// Native Omron observations have no defensible whole-project denominator.
export function omronPresentation(snapshot) {
  if (snapshot?.controller?.manufacturer !== 'Omron'
    || !['Omron CX-Programmer','Omron Sysmac Studio'].includes(snapshot?.project?.platform)) return null;
  const decoded = snapshot.instructionCount > 0
    && snapshot.supportedAreas?.includes('Decoded Omron instruction inventory');
  return {scope:{status:decoded?'PARTIAL':'LIMITED', explanation:decoded
    ? 'Supported native instruction inventory, source rungs and direct-bit write observations are available. Other instructions, implicit writes and control flow remain unassessed. No defensible whole-project coverage denominator is available.'
    : 'Supported saved controller and program-unit records are available. Native logic and shared writes remain unassessed. No defensible whole-project coverage denominator is available.'},
    unassessedCounts:[...new Set(snapshot.unassessedCounts || [])]};
}
