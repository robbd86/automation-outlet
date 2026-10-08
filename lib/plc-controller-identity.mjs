// Platform-specific identity levels describe saved evidence, never a user hint.
const families = {FX3G:'MELSEC-F / FX3G','FX3G/FX3GC':'MELSEC-F / FX3G/FX3GC'};
export function controllerIdentity(snapshot,cpuConfidence='UNKNOWN',mock=false) {
  const c=snapshot?.controller || {},p=snapshot?.project || {};
  const mitsubishi=c.manufacturer==='Mitsubishi Electric' && p.platform==='Mitsubishi GX Works2';
  const typeVerified=!mock && cpuConfidence==='VERIFIED' && Boolean(c.configuredType);
  const exactVerified=!mock && cpuConfidence==='VERIFIED' && Boolean(c.model);
  const family=c.family || (mitsubishi && typeVerified ? families[c.configuredType] || '' : '');
  const platformVerified=!mock && snapshot?.platformDetection?.confidence==='VERIFIED'
    && snapshot.platformDetection.manufacturer===c.manufacturer;
  const typeOnly=mitsubishi && Boolean(c.configuredType) && !c.model;
  const explanation=typeOnly
    ? `The supplied GX Works2 project identifies an ${c.configuredType} programming target. The exact physical main-unit variant is not established by the offline project evidence. Confirm the full model from the installed PLC label or an online hardware check.`
    : 'Saved project configuration only. Installed hardware and running firmware have not been verified.';
  return { platform:mitsubishi?'MITSUBISHI_GX_WORKS2':'STANDARD',
    level:exactVerified?'CONFIGURED_CPU':typeVerified?'PROGRAMMING_TARGET':'PARTIAL',family,
    manufacturerConfidence:mock?'UNKNOWN':platformVerified?'VERIFIED':cpuConfidence,
    familyConfidence:!mock && family?cpuConfidence:'UNKNOWN',
    configuredTypeConfidence:typeVerified?'VERIFIED':mock?'UNKNOWN':cpuConfidence,
    exactPhysicalMainUnit:{status:exactVerified?'VERIFIED':'NOT VERIFIED',confidence:exactVerified?'VERIFIED':'UNKNOWN',value:c.model || ''},
    explanation };
}
