import { assessMitsubishiLifecycle } from './plc-mitsubishi-lifecycle.mjs';
// Reviewed manufacturer facts keyed by exact order number, never by PLC family.
// Recheck the source before extending the review window or adding a product.
export const REVIEWED_LIFECYCLE = Object.freeze({
  '6ES7212-1HE40-0XB0': Object.freeze({
    status: 'ACTIVE', manufacturerStatus: 'Active Product', checkedAt: '2026-10-07',
    reviewBy: '2026-10-21',
    sources: [
      { title: 'Siemens product status', url: 'https://sieportal.siemens.com/en-ww/products-services/detail/6ES7212-1HE40-0XB0' },
      { title: 'Siemens S7-1200 G1 family notice', url: 'https://support.industry.siemens.com/cs/document/109996314/advance-notice-of-product-discontinuation-s7-1200?dti=0&lc=en-GB' },
    ],
    familyNotice: {
      scope: 'SIMATIC S7-1200 first-generation family; refer to Siemens for affected products',
      phaseOutStarts: '2026-11-01', newPartOrdersUntil: '2027-09-30',
      sparePartsPlan: 'Siemens plans spare-part supply for 9 years after new-part availability ends.',
      successorFamily: 'SIMATIC S7-1200 G2',
    },
  }),
});

export function normaliseSiemensOrderNumber(value) {
  if (typeof value !== 'string') return '';
  const part = value.trim().replace(/ /g, '').toUpperCase();
  return /^6ES7\d{3}-[A-Z0-9]{5}-[A-Z0-9]{4}$/.test(part) ? part : '';
}

export function assessLifecycle(snapshot, now = new Date(), catalog = REVIEWED_LIFECYCLE) {
  if (snapshot?.controller?.manufacturer === 'Mitsubishi Electric') return assessMitsubishiLifecycle(snapshot,now);
  const controller = snapshot?.controller;
  const part = normaliseSiemensOrderNumber(controller?.orderNumber);
  const unknown = { status: 'UNKNOWN', label: 'Not verified', orderNumber: part, checkedAt: null,
                    manufacturerStatus: null, sources: [], familyNotice: null };
  // A lifecycle result must not lend authority to an unverified CPU identification.
  const cpuEvidence = snapshot?.topFindings?.some(item => item.id === 'configured-cpu' && item.confidence === 'VERIFIED');
  if (!cpuEvidence || !part || controller?.manufacturer !== 'Siemens' || !controller?.model) return unknown;
  const item = catalog[part];
  if (!item) return unknown;
  const day = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : '';
  const labels = { ACTIVE: 'Active product', PHASE_OUT: 'Being phased out', DISCONTINUED: 'Discontinued' };
  const fresh = day && day >= item.checkedAt && day < item.reviewBy && labels[item.status];
  return { status: fresh ? item.status : 'STALE', label: fresh ? labels[item.status] : 'Needs recheck',
           orderNumber: part, checkedAt: item.checkedAt, reviewBy: item.reviewBy,
           manufacturerStatus: item.manufacturerStatus, sources: item.sources,
           // Planned family dates are context, not automatic changes to exact-part status.
           familyNotice: item.familyNotice || null };
}
