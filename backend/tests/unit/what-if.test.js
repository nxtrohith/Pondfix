import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatIf } from '../../src/services/whatIf.js';

const ids = (r) => r.risks.map((x) => x.id);

test('a hot afternoon with rising temperature and high pH flags oxygen and ammonia watch-outs, and classifies each value', () => {
  const r = whatIf({ temperature: 31.5, temperatureTrend: 'rising', dissolvedOxygen: 5.8, ph: 8.6, hourIst: 15 });
  assert.equal(r.hypothetical, true);
  assert.ok(ids(r).includes('temperature_rising_oxygen')); assert.ok(ids(r).includes('ph_temperature_ammonia'));
  assert.equal(r.status.dissolved_oxygen.status, 'NORMAL');
  assert.equal(r.status.ph.status, 'WARNING'); assert.equal(r.status.ph.direction, 'high');
  assert.ok(r.derived.unionizedFractionPercent > 10);
});

test('the time of day matters: falling oxygen is only a night-time rule', () => {
  assert.ok(ids(whatIf({ dissolvedOxygen: 4.5, dissolvedOxygenTrend: 'falling', hourIst: 22 })).includes('oxygen_falling_overnight'));
  assert.ok(!ids(whatIf({ dissolvedOxygen: 4.5, dissolvedOxygenTrend: 'falling', hourIst: 14 })).includes('oxygen_falling_overnight'));
});

test('optional chemistry feeds the rules and un-ionized ammonia is derived from ammonia, pH and temperature', () => {
  const r = whatIf({ temperature: 30, ph: 8.5, ammonia: 0.5, dissolvedOxygen: 2.5, alkalinity: 35, hourIst: 15 });
  assert.ok(r.derived.unIonizedAmmonia > 0.05);
  assert.ok(ids(r).includes('low_alkalinity_ph_swings')); assert.ok(ids(r).includes('low_oxygen_nitrite'));
  assert.match(r.risks.find((x) => x.id === 'ph_temperature_ammonia').basis, /un-ionized ammonia 0\.\d+/);
});

test('missing values are simply not evaluated, and invalid ones are rejected', () => {
  const r = whatIf({});
  assert.deepEqual(r.risks, []); assert.deepEqual(r.status, {});
  for (const bad of [{ ph: 15 }, { temperature: 'hot' }, { hourIst: 24 }, { phTrend: 'sideways' }, { unknown: 1 }]) assert.throws(() => whatIf(bad), (e) => e.status === 422 || /validation/i.test(e.message));
});
