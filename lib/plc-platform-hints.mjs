export const PLATFORM_HINT_LABELS = Object.freeze({
  AUTO:'Auto-detect (recommended)',SIEMENS:'Siemens',MITSUBISHI:'Mitsubishi Electric',
  ROCKWELL:'Rockwell / Allen-Bradley',OMRON:'Omron',SCHNEIDER:'Schneider Electric',OTHER:'Other / Not sure',
});
export function normalisePlatformHint(value) {
  if (value === undefined || value === null) return 'AUTO';
  if (typeof value !== 'string' || !Object.hasOwn(PLATFORM_HINT_LABELS,value)) {
    const error=new Error('Select a supported PLC manufacturer / platform hint');
    Object.assign(error,{status:400,code:'INVALID_PLATFORM_HINT'});throw error;
  }
  return value;
}
const manufacturers = {Siemens:'SIEMENS','Mitsubishi Electric':'MITSUBISHI',
  'Rockwell Automation':'ROCKWELL','Allen-Bradley':'ROCKWELL','Rockwell / Allen-Bradley':'ROCKWELL',
  Omron:'OMRON','Schneider Electric':'SCHNEIDER'};
export function detectedPlatformEvidence(snapshot) {
  if (!snapshot || /^ao-plc-mock\//.test(snapshot.engineVersion || '')) return null;
  const detection=snapshot.platformDetection;
  if (detection) return detection.confidence==='VERIFIED'
    && detection.manufacturer===snapshot.controller?.manufacturer && detection.platform===snapshot.project?.platform
    ? detection : null;
  // Older workers may have verified identity provenance without this extension.
  // The upload hint is never consulted when determining engineering evidence.
  const supported=snapshot.topFindings?.some(item=>item.id==='configured-cpu' && item.confidence==='VERIFIED');
  if (!supported || !snapshot.controller?.manufacturer || !(snapshot.controller.model || snapshot.controller.configuredType)) return null;
  return {manufacturer:snapshot.controller.manufacturer,platform:snapshot.project?.platform || '',confidence:'VERIFIED'};
}
export function platformMismatch(platformHint,snapshot) {
  const hint=normalisePlatformHint(platformHint),detection=detectedPlatformEvidence(snapshot);
  const detected=detection && manufacturers[detection.manufacturer];
  if (['AUTO','OTHER'].includes(hint) || !detected || detected===hint) return null;
  return {selectedHint:hint,detectedManufacturer:detection.manufacturer,detectedPlatform:detection.platform,
    confidence:'VERIFIED',message:`Platform mismatch detected. ${PLATFORM_HINT_LABELS[hint]} was selected during upload, but the supplied project contains verified ${detection.manufacturer} project evidence. The Snapshot has been analysed as ${detection.manufacturer}.`};
}
