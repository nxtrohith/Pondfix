import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, observedMessage, validateRules, loadRiskRules, getActiveRules, setActiveRules, pondOverallStatus, sidesOf, RuleConfigError } from '../../src/services/risk.js';
import { loadConfig } from '../../src/config/index.js';

const st = (p, v) => classify(p, v).status;
const tmp = (obj) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-rules-')), 'th.json'); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

test('DO rule is unchanged: 3.0 NORMAL, 2.999 WARNING, 2.0 WARNING, just below 2.0 CRITICAL', () => {
  assert.deepEqual([3.0, 2.999, 2.0, 1.999, 0].map((v) => st('dissolved_oxygen', v)), ['NORMAL', 'WARNING', 'WARNING', 'CRITICAL', 'CRITICAL']);
  assert.equal(classify('dissolved_oxygen', 2.5).threshold, 3); assert.equal(classify('dissolved_oxygen', 1.5).threshold, 2);
  assert.deepEqual(sidesOf('dissolved_oxygen'), ['low']);
});

test('pH: acceptable 6.5-8.5 inclusive; warning beyond; critical strictly beyond 6.0 / 9.0; every boundary is unambiguous', () => {
  const cases = [[7.4, 'NORMAL'], [6.5, 'NORMAL'], [8.5, 'NORMAL'], [6.499, 'WARNING'], [8.501, 'WARNING'], [6.0, 'WARNING'], [9.0, 'WARNING'], [5.999, 'CRITICAL'], [9.001, 'CRITICAL'], [0, 'CRITICAL'], [14, 'CRITICAL']];
  for (const [v, want] of cases) assert.equal(st('ph', v), want, `pH ${v}`);
  assert.deepEqual([classify('ph', 6.2).direction, classify('ph', 8.8).direction, classify('ph', 5.5).direction, classify('ph', 9.5).direction], ['low', 'high', 'low', 'high']);
  assert.deepEqual([classify('ph', 6.2).threshold, classify('ph', 8.8).threshold, classify('ph', 5.5).threshold, classify('ph', 9.5).threshold], [6.5, 8.5, 6, 9]);
  assert.equal(classify('ph', 7).direction, undefined); assert.deepEqual(sidesOf('ph'), ['low', 'high']);
});

test('temperature: acceptable 20-32 C inclusive; critical strictly beyond 15 / 35', () => {
  const cases = [[26, 'NORMAL'], [20, 'NORMAL'], [32, 'NORMAL'], [19.99, 'WARNING'], [32.01, 'WARNING'], [15, 'WARNING'], [35, 'WARNING'], [14.99, 'CRITICAL'], [35.01, 'CRITICAL']];
  for (const [v, want] of cases) assert.equal(st('temperature', v), want, `temp ${v}`);
  assert.equal(classify('temperature', 34).threshold, 32); assert.equal(classify('temperature', 36).threshold, 35); assert.equal(classify('temperature', 18).direction, 'low');
});

test('missing, null, NaN, infinite and non-numeric values are UNKNOWN for every parameter, never NORMAL', () => {
  for (const p of ['dissolved_oxygen', 'ph', 'temperature']) for (const bad of [NaN, Infinity, -Infinity, undefined, null, '7.2', {}, true]) assert.equal(st(p, bad), 'UNKNOWN');
});

test('messages are built from the actual value and rule', () => {
  assert.equal(observedMessage('dissolved_oxygen', 2.7, classify('dissolved_oxygen', 2.7)), 'Dissolved oxygen observed at 2.70 mg/L; warning threshold 3.00 mg/L.');
  assert.equal(observedMessage('ph', 8.8, classify('ph', 8.8)), 'pH observed at 8.80; configured upper warning limit 8.50.');
  assert.equal(observedMessage('ph', 5.5, classify('ph', 5.5)), 'pH observed at 5.50; configured lower critical limit 6.00.');
  assert.equal(observedMessage('temperature', 34, classify('temperature', 34)), 'Water temperature observed at 34.0°C; configured upper warning limit 32.0°C.');
});

test('validateRules rejects inverted ranges, overlaps, non-finite numbers, unsupported units/parameters and empty rules', () => {
  const bad = (rule, re) => { const p = validateRules({ ph: rule }); assert.ok(p.some((m) => re.test(m)), `${JSON.stringify(rule)} -> ${p}`); };
  bad({ low_warn: 6.0, low_crit: 6.5 }, /low_crit .* must be < low_warn/);
  bad({ low_warn: 6.5, low_crit: 6.5 }, /low_crit .* must be < low_warn/);
  bad({ high_warn: 9, high_crit: 8.5 }, /high_crit .* must be > high_warn/);
  bad({ low_warn: 8.6, low_crit: 6, high_warn: 8.5, high_crit: 9 }, /acceptable range is empty/);
  bad({ low_warn: NaN, low_crit: 6 }, /finite number/); bad({ high_warn: Infinity, high_crit: 9 }, /finite number/); bad({ low_warn: '6.5', low_crit: 6 }, /finite number/);
  bad({ low_warn: 6.5 }, /needs both low_warn and low_crit/); bad({ high_crit: 9 }, /needs both high_warn and high_crit/);
  bad({ low_warn: 6.5, low_crit: 6, unit: 'mg/L' }, /unsupported unit/); bad({ low_warn: 6.5, low_crit: 6, enabled: 'yes' }, /enabled must be/);
  bad({ low_warn: 6.5, low_crit: -3 }, /physically possible/); bad({}, /at least one side/); bad({ low_warn: 6.5, low_crit: 6, bogus: 1 }, /unknown key/);
  assert.ok(validateRules({ salinity: { low_warn: 1, low_crit: 0 } }).some((m) => /unsupported parameter/.test(m)));
  assert.deepEqual(validateRules({ ph: { low_warn: 6.5, low_crit: 6, high_warn: 8.5, high_crit: 9, unit: 'pH', enabled: true } }), []);
});

test('default rule set is the documented provisional demo configuration', () => {
  const r = loadRiskRules({});
  assert.equal(r.mode, 'provisional_demo');
  assert.deepEqual(['dissolved_oxygen', 'ph', 'temperature'].map((p) => r.rules[p].source), ['project_default', 'provisional_demo', 'provisional_demo']);
  assert.deepEqual(r.rules.temperature, { low_warn: 20, low_crit: 15, high_warn: 32, high_crit: 35, unit: 'C', enabled: true, source: 'provisional_demo' });
});

test('a rules file overrides one parameter and marks it configured; others keep their defaults', () => {
  const r = loadRiskRules({ AQUAGUARD_THRESHOLDS: tmp({ ph: { low_warn: 6.8, low_crit: 6.3, high_warn: 8.2, high_crit: 8.8 } }) });
  assert.equal(r.mode, 'configured'); assert.equal(r.rules.ph.source, 'configured'); assert.equal(r.rules.ph.high_warn, 8.2);
  assert.equal(r.rules.dissolved_oxygen.low_warn, 3); assert.equal(r.rules.temperature.source, 'provisional_demo');
  const prev = getActiveRules();
  try { setActiveRules(r); assert.equal(st('ph', 8.3), 'WARNING'); assert.equal(st('ph', 8.9), 'CRITICAL'); } finally { setActiveRules(prev); }
  assert.equal(st('ph', 8.3), 'NORMAL');
});

test('invalid configuration throws instead of silently disabling alerts', () => {
  for (const f of [tmp('not json'), tmp({ ph: { low_warn: 6, low_crit: 7 } }), tmp({ salinity: { low_warn: 1, low_crit: 0 } }), tmp([1]), '/nonexistent/rules.json']) {
    assert.throws(() => loadRiskRules({ AQUAGUARD_THRESHOLDS: f }), RuleConfigError);
  }
  assert.throws(() => loadRiskRules({ RISK_RULES_DISABLED: 'salinity' }), RuleConfigError);
  assert.throws(() => loadConfig({ AQUAGUARD_THRESHOLDS: tmp({ temp: { low_warn: 20, low_crit: 25 } }) }), RuleConfigError, 'startup must fail');
});

test('a rule can be disabled explicitly; the parameter is then UNKNOWN, not healthy', () => {
  const r = loadRiskRules({ RISK_RULES_DISABLED: 'ph, temperature' });
  assert.equal(r.rules.ph.enabled, false); assert.equal(r.rules.dissolved_oxygen.enabled, true);
  const prev = getActiveRules();
  try { setActiveRules(r); assert.equal(st('ph', 3), 'UNKNOWN'); assert.equal(st('dissolved_oxygen', 1), 'CRITICAL'); } finally { setActiveRules(prev); }
});

test('pond status: any fresh excursion wins; stale DO is not hidden by a fresh pH; nothing is healthy without data', () => {
  const now = new Date('2026-03-01T12:00:00Z'); const at = (m) => new Date(+now - m * 60000);
  const L = (value, m) => ({ value, recordedAt: at(m) });
  assert.equal(pondOverallStatus({}, now, 60), 'NO_DATA');
  assert.equal(pondOverallStatus({ dissolved_oxygen: L(6, 5), ph: L(7.4, 5), temperature: L(27, 5) }, now, 60), 'NORMAL');
  assert.equal(pondOverallStatus({ dissolved_oxygen: L(6, 5), ph: L(9.3, 5) }, now, 60), 'CRITICAL');
  assert.equal(pondOverallStatus({ dissolved_oxygen: L(6, 5), temperature: L(33, 5) }, now, 60), 'WARNING');
  assert.equal(pondOverallStatus({ dissolved_oxygen: L(6, 300), ph: L(7.4, 5) }, now, 60), 'STALE');
  assert.equal(pondOverallStatus({ dissolved_oxygen: L(6, 300), ph: L(9.3, 5) }, now, 60), 'CRITICAL');
  assert.equal(pondOverallStatus({ ph: L(7.4, 300) }, now, 60), 'STALE');
  assert.equal(pondOverallStatus({ ph: L(7.4, 5) }, now, 60), 'NORMAL');
});
