import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { assessLifecycle, normaliseSiemensOrderNumber, REVIEWED_LIFECYCLE } from '../lib/plc-lifecycle.mjs';
import { publicJob } from '../lib/plc-audit-service.mjs';

const snapshot = { controller: { manufacturer: 'Siemens', model: 'CPU 1212C DC/DC/Rly', orderNumber: '6ES7 212-1HE40-0XB0' },
                   topFindings: [{ id: 'configured-cpu', confidence: 'VERIFIED' }], maintenanceSummary: { lifecycle: 'Not assessed' } };
const day = new Date('2026-10-07T12:00:00Z');
test('lifecycle uses the exact verified order number and retains source/date provenance', () => {
  const result = assessLifecycle(snapshot, day);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.orderNumber, '6ES7212-1HE40-0XB0');
  assert.equal(result.checkedAt, '2026-10-07');
  assert.match(result.sources[0].url, /6ES7212-1HE40-0XB0$/);
  assert.equal(result.familyNotice.phaseOutStarts, '2026-11-01');
  assert.match(result.familyNotice.scope, /family/);
  assert.equal(result.familyNotice.newPartOrdersUntil, '2027-09-30');
  assert.equal(snapshot.maintenanceSummary.lifecycle, 'Not assessed', 'source Snapshot is not silently rewritten');
});
test('unmatched variants, other manufacturers and missing CPU evidence stay unknown', () => {
  for (const controller of [
    { ...snapshot.controller, orderNumber: '6ES7212-1HE40-0XB1' },
    { ...snapshot.controller, orderNumber: '6ES7212-1AE40-0XB0' },
    { ...snapshot.controller, manufacturer: 'Other' },
    { ...snapshot.controller, orderNumber: '' },
  ]) assert.equal(assessLifecycle({ ...snapshot, controller }, day).status, 'UNKNOWN');
  assert.equal(assessLifecycle({ ...snapshot, topFindings: [] }, day).status, 'UNKNOWN');
  assert.equal(assessLifecycle(null, day).status, 'UNKNOWN');
  assert.equal(normaliseSiemensOrderNumber('6ES72121HE400XB0'), '');
});
test('expired and future-dated reviews cannot present old status as current', () => {
  for (const date of ['2026-10-06', '2026-10-21', '2026-11-01', '2027-10-01']) {
    assert.equal(assessLifecycle(snapshot, new Date(date)).status, 'STALE');
  }
  assert.equal(assessLifecycle(snapshot, new Date('invalid')).status, 'STALE');
});
test('phase-out and discontinued statuses preserve the manufacturer distinction', () => {
  for (const status of ['PHASE_OUT', 'DISCONTINUED']) {
    const item = { ...REVIEWED_LIFECYCLE['6ES7212-1HE40-0XB0'], status, manufacturerStatus: status };
    assert.equal(assessLifecycle(snapshot, day, { '6ES7212-1HE40-0XB0': item }).status, status);
  }
});
test('customer API supplies lifecycle separately without changing stored engineering results', () => {
  const result = publicJob({ id: 'aud_fixture', snapshotResult: snapshot });
  assert.equal(result.snapshotResult, snapshot);
  assert.equal(result.lifecycleAssessment.orderNumber, '6ES7212-1HE40-0XB0');
  assert.equal(result.workerKey, undefined);
});
const script = await readFile(new URL('../plc-audit.js', import.meta.url), 'utf8');
test('lifecycle rendering separates family plans and blocks unsafe source links', () => {
  const context = vm.createContext({ URL, document: { addEventListener() {} } });
  vm.runInContext(script, context);
  const result = assessLifecycle(snapshot, day);
  const rendered = context.renderLifecycle(result);
  assert.match(rendered, /Active product/);
  assert.match(rendered, /Family notice/);
  assert.match(rendered, /1 November 2026/);
  assert.match(rendered, /30 September 2027/);
  assert.match(rendered, /7 October 2026/);
  assert.doesNotMatch(context.renderLifecycle({ ...result, sources: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }), /javascript:/);
  assert.match(context.renderLifecycle(assessLifecycle(snapshot, new Date('2026-11-01'))), /Needs recheck/);
});

test('dated lifecycle review resolves old summary wording without rewriting engineering evidence', () => {
  const context = vm.createContext({ URL, document: { addEventListener() {} } });
  vm.runInContext(script, context);
  const point = 'CPU identity comes from saved project configuration. I/O, safety status and lifecycle remain unassessed.';
  const result = { ...snapshot, maintenanceSummary: { managerPoints: [point] } };
  const rendered = context.renderSnapshot(result, assessLifecycle(snapshot, day));
  assert.match(rendered, /I\/O and safety status remain unassessed/);
  assert.match(rendered, /Manufacturer lifecycle is shown separately with its review date/);
  assert.doesNotMatch(rendered, /lifecycle remain unassessed/);
  assert.equal(result.maintenanceSummary.managerPoints[0], point);
  assert.match(context.renderSnapshot(result, assessLifecycle(null, day)), /lifecycle remain unassessed/);
});
