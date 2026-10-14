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
