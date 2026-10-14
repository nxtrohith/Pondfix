import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downstreamRisks, unionizedFraction } from '../../src/services/ai/couplings.js';

// 2026-01-20 09:30 UTC = 15:00 IST (afternoon); 15:30 UTC = 21:00 IST (night)
const AFTERNOON = new Date('2026-01-20T09:30:00Z'); const NIGHT = new Date('2026-01-20T15:30:00Z');
const p = (value, trend = 'steady') => ({ value, trend, minutesSinceReading: 5 });
const ids = (r) => r.map((x) => x.id);

test('rising warm water predicts falling oxygen in a few hours', () => {
  const r = downstreamRisks({ parameters: { temperature: p(30.8, 'rising'), dissolved_oxygen: p(6) }, at: AFTERNOON });
  const hit = r.find((x) => x.id === 'temperature_rising_oxygen');
  assert.ok(hit); assert.equal(hit.affects, 'dissolved_oxygen'); assert.deepEqual(hit.leadHours, [2, 4]);
  assert.match(hit.basis, /30\.8/);
});

test('steady or cool water does not trigger the temperature rule', () => {
  assert.ok(!ids(downstreamRisks({ parameters: { temperature: p(30.8, 'steady') }, at: AFTERNOON })).includes('temperature_rising_oxygen'));
  assert.ok(!ids(downstreamRisks({ parameters: { temperature: p(24, 'rising') }, at: AFTERNOON })).includes('temperature_rising_oxygen'));
});

test('oxygen falling after dark keeps falling; the same trend in daylight is not flagged', () => {
  assert.ok(ids(downstreamRisks({ parameters: { dissolved_oxygen: p(4.2, 'falling') }, at: NIGHT })).includes('oxygen_falling_overnight'));
  assert.ok(!ids(downstreamRisks({ parameters: { dissolved_oxygen: p(4.2, 'falling') }, at: AFTERNOON })).includes('oxygen_falling_overnight'));
});

test('high pH with warm water flags ammonia toxicity, using the reading when there is one', () => {
  const r = downstreamRisks({ parameters: { ph: p(8.6), temperature: p(31) }, otherReadings: { un_ionized_ammonia: { value: 0.042, unit: 'mg/L' } }, at: AFTERNOON });
  const hit = r.find((x) => x.id === 'ph_temperature_ammonia');
  assert.ok(hit); assert.match(hit.basis, /0\.042/);
  assert.ok(!ids(downstreamRisks({ parameters: { ph: p(7.4), temperature: p(27) }, at: AFTERNOON })).includes('ph_temperature_ammonia'));
});

test('afternoon bloom signature warns of an overnight oxygen crash, only in the afternoon', () => {
  const params = { ph: p(8.7), dissolved_oxygen: p(10.5) };
  assert.ok(ids(downstreamRisks({ parameters: params, at: AFTERNOON })).includes('bloom_overnight_oxygen_crash'));
  assert.ok(!ids(downstreamRisks({ parameters: params, at: NIGHT })).includes('bloom_overnight_oxygen_crash'));
});

test('low oxygen and low alkalinity flag nitrite build-up and pH swings from the extra chemistry readings', () => {
  const r = downstreamRisks({ parameters: { dissolved_oxygen: p(2.5) }, otherReadings: { nitrite: { value: 0.4 }, alkalinity: { value: 40 } }, at: AFTERNOON });
  assert.ok(ids(r).includes('low_oxygen_nitrite')); assert.ok(ids(r).includes('low_alkalinity_ph_swings'));
  assert.match(r.find((x) => x.id === 'low_oxygen_nitrite').basis, /0\.400/);
});

test('stale readings predict nothing, and no readings give an empty list', () => {
  assert.deepEqual(downstreamRisks({ parameters: { temperature: { value: 31, trend: 'rising', minutesSinceReading: 600 } }, at: AFTERNOON }), []);
  assert.deepEqual(downstreamRisks({}), []);
});

test('output is bounded, ordered by lead time, never claims safety and gives no doses', () => {
  const r = downstreamRisks({ parameters: { temperature: p(32, 'rising'), ph: p(8.7), dissolved_oxygen: p(2.5, 'falling') }, otherReadings: { alkalinity: { value: 30 } }, at: NIGHT });
  assert.ok(r.length >= 3 && r.length <= 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].leadHours[0] <= r[i].leadHours[0]);
  for (const x of r) assert.doesNotMatch(`${x.basis} ${x.precaution}`, /\bsafe\b|\bmg\/L of\b|\bdose\b|\bgrams?\b|\bkg\b/i);
});

test('un-ionized fraction matches the published ~5% at pH 8, 25 C', () => {
  assert.ok(Math.abs(unionizedFraction(8, 25) - 0.054) < 0.005);
});
