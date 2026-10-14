// Ammonia, nitrate and turbidity: accepted and stored as simulated readings, shown in the snapshot, but never an alert and never
// part of the pond status.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from '../helpers.js';

let env; let pond;
before(async () => { env = await startEnv(); pond = await env.makePond('Pond 1'); });
after(async () => { await env?.stop(); });

const chem = (values) => ({ pondId: String(pond._id), source: 'simulated', values });

test('a simulated chemistry reading is stored, appears in the snapshot as UNKNOWN risk, and raises no alert', async () => {
  const res = await env.post('/api/measurements', chem([
    { parameter: 'ammonia', value: 4.5, unit: 'mg/L' }, { parameter: 'nitrate', value: 300, unit: 'mg/L' }, { parameter: 'turbidity', value: 800, unit: 'NTU' },
  ]));
  assert.equal(res.status, 201);
  for (const p of ['ammonia', 'nitrate', 'turbidity']) assert.equal(res.body.risk[p].status, 'UNKNOWN');
  assert.deepEqual(res.body.alerts, []);
  assert.equal(res.body.alertStateUpdated, false);
  const snap = (await env.get('/api/ponds/summaries')).body.items.find((s) => s.pond.id === String(pond._id));
  assert.equal(snap.parameters.ammonia.value, 4.5);
  assert.equal(snap.parameters.ammonia.source, 'simulated');
  assert.equal(snap.parameters.turbidity.unit, 'NTU');
  assert.equal(snap.parameters.ammonia.risk, 'UNKNOWN');
  assert.equal(snap.riskStatus, 'NO_DATA', 'chemistry alone must not make a pond look healthy or unhealthy');
  assert.equal((await env.get('/api/alerts')).body.items.length, 0);
});

test('chemistry does not change the status driven by dissolved oxygen, and values outside the physical range are rejected', async () => {
  await env.post('/api/measurements', { pondId: String(pond._id), source: 'live', values: [{ parameter: 'dissolved_oxygen', value: 5.5, unit: 'mg/L' }] });
  const snap = (await env.get('/api/ponds/summaries')).body.items.find((s) => s.pond.id === String(pond._id));
  assert.equal(snap.riskStatus, 'NORMAL');
  const bad = await env.post('/api/measurements', chem([{ parameter: 'ammonia', value: 25, unit: 'mg/L' }]));
  assert.equal(bad.status, 422);
});

test('the measurement list can be filtered to a chemistry parameter', async () => {
  const res = await env.get(`/api/ponds/${pond._id}/measurements?parameter=nitrate`);
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length >= 1);
  assert.ok(res.body.items.every((m) => m.values.length === 1 && m.values[0].parameter === 'nitrate'));
});

test('downstream-risks: low oxygen plus simulated chemistry gives a nitrite watch-out, uses fresh chemistry, and never creates an alert', async () => {
  const p2 = await env.makePond('Pond 2');
  const recordedAt = env.state.now.toISOString();
  await env.post('/api/measurements', { pondId: String(p2._id), source: 'live', recordedAt, values: [{ parameter: 'dissolved_oxygen', value: 2.5, unit: 'mg/L' }] });
  await env.post('/api/measurements', { pondId: String(p2._id), source: 'simulated', recordedAt, values: [{ parameter: 'nitrite', value: 0.4, unit: 'mg/L' }, { parameter: 'alkalinity', value: 35, unit: 'mg/L' }] });
  const res = await env.get(`/api/ponds/${p2._id}/downstream-risks`);
  assert.equal(res.status, 200);
  const ids = res.body.risks.map((r) => r.id);
  assert.ok(ids.includes('low_oxygen_nitrite') && ids.includes('low_alkalinity_ph_swings'), `got ${ids}`);
  assert.match(res.body.risks.find((r) => r.id === 'low_oxygen_nitrite').basis, /0\.400/);
  const none = await env.get(`/api/ponds/${(await env.makePond('Pond 3'))._id}/downstream-risks`);
  assert.deepEqual(none.body.risks, []);
  assert.equal((await env.get('/api/ponds/not-an-id/downstream-risks')).status, 400);
});

test('what-if: hypothetical conditions return watch-outs over HTTP, write nothing, and reject bad input with 422', async () => {
  const before = await env.db.collection('measurements').countDocuments();
  const res = await env.post('/api/what-if', { temperature: 31.5, temperatureTrend: 'rising', dissolvedOxygen: 5, ph: 8.6, hourIst: 15 });
  assert.equal(res.status, 200); assert.equal(res.body.hypothetical, true);
  assert.ok(res.body.risks.some((r) => r.id === 'temperature_rising_oxygen'));
  assert.equal(await env.db.collection('measurements').countDocuments(), before);
  assert.equal((await env.db.collection('alerts').countDocuments({ origin: 'observed', createdAt: { $gte: new Date(Date.now() - 60000) } })), 0);
  assert.equal((await env.post('/api/what-if', { ph: 99 })).status, 422);
});
