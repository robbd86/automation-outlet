// Reviewed manufacturer bulletins. Match complete model/suffix; never expand a
// programming-type selection into a physical CPU identity or replacement claim.
const checkedAt = '2026-10-08', reviewBy = '2026-10-22';
const sourceG = Object.freeze({ title: 'Mitsubishi FX3G/FX3GC discontinuation bulletin FAM-A-0091-C',
  url: 'https://www.mitsubishielectric.com/fa/document/technews/plc_fx/fam-a-0091/fama0091c.pdf' });
const sourceGE = Object.freeze({ title: 'Mitsubishi FX3GE discontinuation bulletin FAM-A-0090-B',
  url: 'https://www.mitsubishielectric.com/fa/document/technews/plc_fx/fam-a-0090/fama0090b.pdf' });
const notices = Object.freeze([
  Object.freeze({ family: 'FX3G / FX3GC', ordersUntil: '2026-06-30', productionEnds: '2026-12-31',
    repairAcceptanceUntil: '2033-12-31', source: sourceG }),
  Object.freeze({ family: 'FX3GE', ordersUntil: '2025-06-30', productionEnds: '2025-09-30',
    repairAcceptanceUntil: '2032-09-30', source: sourceGE }),
]);
const mainUnits = ['14','24','40','60'].flatMap(size =>
  ['MR/ES','MT/ES','MT/ESS','MR/DS','MT/DS','MT/DSS'].map(suffix => `FX3G-${size}${suffix}`));
const connectorUnits = ['FX3GC-32MT/D','FX3GC-32MT/DSS'];
const ethernetUnits = ['24','40'].flatMap(size =>
  ['MR/ES','MT/ES','MT/ESS','MR/DS','MT/DS','MT/DSS'].map(suffix => `FX3GE-${size}${suffix}`));
export const REVIEWED_MITSUBISHI_LIFECYCLE = Object.freeze(Object.fromEntries([
  ...mainUnits.map(model => [model, notices[0]]), ...connectorUnits.map(model => [model, notices[0]]),
  ...ethernetUnits.map(model => [model, notices[1]]),
].map(([model,notice]) => [model,Object.freeze({ model,notice,checkedAt,reviewBy })])));

export function normaliseMitsubishiModel(value) {
  if (typeof value !== 'string') return '';
  const model = value.trim().toUpperCase();
  return /^FX3G(?:C|E)?-\d{2}M[RT]\/(?:ES|ESS|DS|DSS|D)$/.test(model) ? model : '';
}
function dayString(now) {
  return now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString().slice(0,10) : '';
}
export function assessMitsubishiLifecycle(snapshot,now = new Date()) {
  const controller = snapshot?.controller, day = dayString(now);
  const verified = snapshot?.topFindings?.some(item => item.id === 'configured-cpu' && item.confidence === 'VERIFIED');
  const part = normaliseMitsubishiModel(controller?.orderNumber);
  const model = normaliseMitsubishiModel(controller?.model);
  const unknown = { status:'UNKNOWN', label:'Not verified',orderNumber:part,checkedAt:null,
    manufacturerStatus:null,sources:[],familyNotice:null };
  if (controller?.manufacturer !== 'Mitsubishi Electric' || !verified) return unknown;
  const item = part && part === model && REVIEWED_MITSUBISHI_LIFECYCLE[part];
  if (item) {
    const notice = item.notice, fresh = day && day >= item.checkedAt && day < item.reviewBy;
    const ended = day && day > notice.productionEnds;
    return { status:fresh ? ended ? 'DISCONTINUED' : 'PHASE_OUT' : 'STALE',
      label:fresh ? ended ? 'Discontinued' : 'Being phased out' : 'Needs recheck',orderNumber:part,
      checkedAt:item.checkedAt,reviewBy:item.reviewBy,
      manufacturerStatus:`Production ${ended ? 'ended' : 'scheduled to end'} ${notice.productionEnds}`,
      sources:[notice.source],familyNotice:{ kind:'EXACT_MODEL_SCHEDULE',scope:`Manufacturer schedule for ${part}`,
        notices:[notice],checkedAt:item.checkedAt,reviewBy:item.reviewBy,stale:!fresh } };
  }
  if (!['FX3G','FX3G/FX3GC'].includes(controller?.configuredType)) return unknown;
  const fresh = day && day >= checkedAt && day < reviewBy;
  return { ...unknown,sources:[sourceG,sourceGE],familyNotice:{ kind:'PROGRAMMING_TYPE_CONTEXT',
    scope:'Manufacturer notices for FX3G/FX3GC and FX3GE; the programming selection does not identify the physical variant.',
    notices,checkedAt,reviewBy,stale:!fresh } };
}
