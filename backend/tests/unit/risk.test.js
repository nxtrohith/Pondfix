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

test('DO boundaries at two-decimal precision (1.99 / 2.00 / 2.99 / 3.00) and the demo values', () => {
  const st = (v) => classify('dissolved_oxygen', v).status;
  assert.deepEqual([1.99, 2.0, 2.99, 3.0].map(st), ['CRITICAL', 'WARNING', 'WARNING', 'NORMAL']);
  assert.deepEqual([3.5, 2.5, 1.5].map(st), ['NORMAL', 'WARNING', 'CRITICAL']);
  assert.deepEqual([classify('dissolved_oxygen', 1.99).threshold, classify('dissolved_oxygen', 2.5).threshold, classify('dissolved_oxygen', 3.5).threshold], [2, 3, null]);
});

test('parameters without a rule, and missing or non-finite values, are UNKNOWN, never healthy', () => {
  assert.equal(classify('water_level', 1.2).status, 'UNKNOWN');
  for (const p of ['ph', 'temperature']) for (const bad of [NaN, Infinity, -Infinity, undefined, null, '7']) assert.equal(classify(p, bad).status, 'UNKNOWN');
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

test('ammonia, nitrate and turbidity have no alert limits: always UNKNOWN, never NORMAL and never an alert', async () => {
  const { classify, RULE_PARAMETERS } = await import('../../src/services/risk.js');
  for (const p of ['ammonia', 'nitrate', 'turbidity']) {
    assert.ok(!RULE_PARAMETERS.includes(p));
    assert.equal(classify(p, 0.001).status, 'UNKNOWN');
    assert.equal(classify(p, 999).status, 'UNKNOWN');
  }
});
