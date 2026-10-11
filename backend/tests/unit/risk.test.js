import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, dataState, pondRiskStatus, THRESHOLDS } from '../../src/services/risk.js';

test('DO boundary classification (strict < comparisons)', () => {
  assert.equal(classify('dissolved_oxygen', 1.9).status, 'CRITICAL');
  assert.equal(classify('dissolved_oxygen', 2.0).status, 'WARNING');
  assert.equal(classify('dissolved_oxygen', 2.9).status, 'WARNING');
  assert.equal(classify('dissolved_oxygen', 3.0).status, 'NORMAL');
  assert.equal(classify('dissolved_oxygen', 0).status, 'CRITICAL');
  assert.equal(classify('dissolved_oxygen', 1.8).threshold, 2.0);
  assert.equal(classify('dissolved_oxygen', 2.7).threshold, 3.0);
});

test('parameters without validated rules are UNKNOWN, never healthy', () => {
  for (const p of ['ph', 'temperature', 'water_level']) assert.equal(classify(p, 7.2).status, 'UNKNOWN');
  assert.equal(classify('dissolved_oxygen', NaN).status, 'UNKNOWN');
  assert.equal(classify('dissolved_oxygen', undefined).status, 'UNKNOWN');
  assert.equal(classify('dissolved_oxygen', null).status, 'UNKNOWN');
});

test('thresholds stay in sync with the ML project config (single source of truth)', () => {
  const py = fs.readFileSync(new URL('../../../ml/aquaguard_config.py', import.meta.url), 'utf8');
  assert.equal(Number(/^DO_WARNING\s*=\s*([\d.]+)/m.exec(py)[1]), THRESHOLDS.dissolved_oxygen.low_warn);
  assert.equal(Number(/^DO_CRITICAL\s*=\s*([\d.]+)/m.exec(py)[1]), THRESHOLDS.dissolved_oxygen.low_crit);
});

test('missing and stale data are not healthy', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  assert.equal(pondRiskStatus(undefined, now, 60), 'NO_DATA');
  assert.equal(pondRiskStatus({ value: 6, recordedAt: new Date('2026-03-01T10:00:00Z') }, now, 60), 'STALE');
  assert.equal(pondRiskStatus({ value: 6, recordedAt: new Date('2026-03-01T11:30:00Z') }, now, 60), 'NORMAL');
  assert.equal(pondRiskStatus({ value: 1.5, recordedAt: new Date('2026-03-01T11:59:00Z') }, now, 60), 'CRITICAL');
  assert.deepEqual(dataState(null, now, 60), { state: 'NO_DATA', ageMinutes: null });
});
