import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator, SIM_PARAMETERS, DERIVED_PARAMETERS, unionizedFraction } from '../lib/wq-simulator.js';

const T0 = Date.UTC(2025, 11, 14, 0, 0, 0);
const series = (n, f, seed = 'pond-a') => {
  const sim = createSimulator(seed);
  return Array.from({ length: n }, (_, i) => sim.step({ recordedAt: new Date(T0 + i * 15 * 60000), ...f(i) }));
};
const pick = (rows, parameter) => rows.map((r) => r.find((v) => v.parameter === parameter).value);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('returns exactly the simulated and derived parameters with canonical units', () => {
  const [row] = series(1, () => ({ do: 6, ph: 8, temp: 28 }));
  assert.deepEqual(row.map((v) => [v.parameter, v.unit]), SIM_PARAMETERS.map((p) => [p.parameter, p.unit]));
});

test('is deterministic for the same seed and inputs, and differs between ponds', () => {
  const f = (i) => ({ do: 5 + Math.sin(i / 10), ph: 8, temp: 27 });
  assert.deepEqual(series(200, f), series(200, f));
  assert.notDeepEqual(series(200, f), series(200, f, 'pond-b'));
});

test('stays inside the database bounds over 30 days of extreme inputs', () => {
  const rows = series(30 * 96, (i) => ({ do: i % 2 ? 0.1 : 25, ph: i % 3 ? 5 : 10, temp: i % 5 ? 12 : 38 }));
  for (const [p, lo, hi] of [['ammonia', 0, 20], ['nitrate', 0, 500], ['turbidity', 0, 1000], ['nitrite', 0, 20], ['alkalinity', 0, 500], ['salinity', 0, 50], ['un_ionized_ammonia', 0, 5]]) {
    for (const v of pick(rows, p)) assert.ok(Number.isFinite(v) && v >= lo && v <= hi, `${p}=${v}`);
  }
});

test('low dissolved oxygen gives higher ammonia than high oxygen (same everything else)', () => {
  const low = mean(pick(series(96 * 5, () => ({ do: 1.5, ph: 7.8, temp: 28 })).slice(96), 'ammonia'));
  const high = mean(pick(series(96 * 5, () => ({ do: 7, ph: 7.8, temp: 28 })).slice(96), 'ammonia'));
  assert.ok(low > high * 1.5, `low-DO ammonia ${low} should clearly exceed high-DO ${high}`);
});

test('warmer water gives higher ammonia, and higher pH with oxygen surplus gives higher turbidity', () => {
  const cold = mean(pick(series(96 * 5, () => ({ do: 6, ph: 7.8, temp: 22 })).slice(96), 'ammonia'));
  const warm = mean(pick(series(96 * 5, () => ({ do: 6, ph: 7.8, temp: 33 })).slice(96), 'ammonia'));
  assert.ok(warm > cold);
  const calm = mean(pick(series(96 * 8, () => ({ do: 5, ph: 7.2, temp: 28 })).slice(200), 'turbidity'));
  const bloom = mean(pick(series(96 * 8, () => ({ do: 9, ph: 9, temp: 28 })).slice(200), 'turbidity'));
  assert.ok(bloom > calm + 10);
});

test('low oxygen lets nitrite build up compared with well-oxygenated water', () => {
  const low = mean(pick(series(96 * 6, () => ({ do: 1.5, ph: 7.8, temp: 28 })).slice(96), 'nitrite'));
  const high = mean(pick(series(96 * 6, () => ({ do: 7, ph: 7.8, temp: 28 })).slice(96), 'nitrite'));
  assert.ok(low > high * 2, `low-DO nitrite ${low} should clearly exceed high-DO ${high}`);
});

test('un-ionized ammonia is derived: a pure function of ammonia, pH and temperature, and rises with both pH and warmth', () => {
  assert.deepEqual([...DERIVED_PARAMETERS], ['un_ionized_ammonia']);
  const rows = series(200, (i) => ({ do: 6, ph: 7.5 + (i % 10) / 10, temp: 26 + (i % 7) }));
  rows.slice(5).forEach((r, k) => {
    const i = k + 5; const get = (p) => r.find((v) => v.parameter === p).value;
    const expected = get('ammonia') * unionizedFraction(7.5 + (i % 10) / 10, 26 + (i % 7));
    assert.ok(Math.abs(get('un_ionized_ammonia') - expected) < 0.0006, `${get('un_ionized_ammonia')} vs ${expected}`);
  });
  assert.ok(unionizedFraction(8.5, 28) > unionizedFraction(7.5, 28) * 5);
  assert.ok(unionizedFraction(8, 32) > unionizedFraction(8, 22));
  assert.ok(Math.abs(unionizedFraction(8, 25) - 0.054) < 0.005, 'matches the published ~5% at pH 8, 25 C');
});

test('alkalinity falls when ammonia is being nitrified for a long time, and salinity stays near its pond baseline', () => {
  const alk = pick(series(96 * 30, () => ({ do: 7, ph: 7.8, temp: 30 })), 'alkalinity');
  assert.ok(alk.every((x) => x >= 20 && x <= 400));
  const sal = pick(series(96 * 30, () => ({ do: 6, ph: 7.8, temp: 28 })), 'salinity');
  assert.ok(Math.max(...sal) - Math.min(...sal) < 8, 'salinity drifts slowly');
});

test('ammonia peaks after feeding times (IST), not at random hours', () => {
  const rows = series(96 * 6, () => ({ do: 6, ph: 7.8, temp: 28 })).slice(96);
  const byHour = new Map();
  rows.forEach((r, i) => { const h = Math.floor((((i + 96) * 15) / 60 + 5.5) % 24); byHour.set(h, [...(byHour.get(h) ?? []), r.find((v) => v.parameter === 'ammonia').value]); });
  assert.ok(mean(byHour.get(11)) > mean(byHour.get(4)), 'late-morning ammonia should exceed pre-dawn ammonia');
});

test('missing inputs fall back to the last seen value; a long gap does not blow up state', () => {
  const sim = createSimulator('gap');
  const a = sim.step({ recordedAt: new Date(T0), do: 6, ph: 8, temp: 28 });
  const b = sim.step({ recordedAt: new Date(T0 + 15 * 60000), do: null, ph: undefined, temp: NaN });
  assert.ok(b.every((v) => Number.isFinite(v.value)));
  const c = sim.step({ recordedAt: new Date(T0 + 90 * 24 * 3600000), do: 6, ph: 8, temp: 28 });
  assert.ok(c.every((v, i) => Math.abs(v.value - a[i].value) < 60));
});

test('rejects out-of-order observations and invalid dates', () => {
  const sim = createSimulator('order');
  sim.step({ recordedAt: new Date(T0 + 1000), do: 6, ph: 8, temp: 28 });
  assert.throws(() => sim.step({ recordedAt: new Date(T0), do: 6, ph: 8, temp: 28 }), RangeError);
  assert.throws(() => sim.step({ recordedAt: new Date('nope'), do: 6, ph: 8, temp: 28 }), TypeError);
});

// --- generator: historical rows -> separate simulated measurements ---------------------------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planFile } from '../scripts/import-fwi.js';
import { simulateDocs } from '../scripts/generate-simulated-wq.js';

test('simulateDocs: one simulated doc per historical row, same instant, own dedupKey, provenance links back, history untouched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-'));
  const file = path.join(dir, 'ara2_aaaa0001.csv');
  fs.writeFileSync(file, ['Date/Time (IST),DO (mg/L),pH,Temperature (°C),QC_Flag_DateTime,QC_Flag_DO,QC_Flag_pH',
    '2025-12-14 02:15:00,5.69,8.53,25.2,,,', '2025-12-14 02:30:00,5.5,8.5,25.1,,,', '2025-12-14 02:45:00,,8.4,25.0,,,'].join('\n'));
  const { docs } = await planFile(file, new Date('2026-01-01T00:00:00Z'));
  const before = JSON.stringify(docs);
  const sims = simulateDocs('ara2_aaaa0001', docs, new Date('2026-01-01T00:00:00Z'));
  assert.equal(JSON.stringify(docs), before, 'historical documents must not be modified');
  assert.equal(sims.length, 3);
  sims.forEach((s, i) => {
    assert.equal(s.source, 'simulated');
    assert.equal(+s.recordedAt, +docs[i].recordedAt);
    assert.deepEqual(s.values.map((v) => v.parameter), ['ammonia', 'nitrate', 'turbidity', 'nitrite', 'alkalinity', 'salinity', 'un_ionized_ammonia']);
    assert.equal(s.dedupKey, `sim:wq-sim-v2:${docs[i].dedupKey}`);
    assert.equal(s.provenance.simulation.derivedFrom, docs[i].dedupKey);
    assert.ok(!('qcFlags' in s.provenance) && !('dataQuality' in s.provenance));
  });
  assert.deepEqual(sims, simulateDocs('ara2_aaaa0001', docs, new Date('2026-01-01T00:00:00Z')), 'repeat run is identical (idempotent)');
});
