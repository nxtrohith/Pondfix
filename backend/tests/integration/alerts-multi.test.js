import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from '../helpers.js';

let env; let pond; let seq = 0;
before(async () => { env = await startEnv(); pond = await env.makePond('TEST multi'); });
after(() => env.stop());
beforeEach(async () => { await env.reset(); env.state.now = new Date('2026-03-01T12:00:00Z'); seq = 0; });

const P = (p) => ({ do: ['dissolved_oxygen', 'mg/L'], ph: ['ph', 'pH'], temp: ['temperature', 'C'] }[p]);
// Each call is a minute later unless `at` is given, so readings arrive in order by default.
const send = (vals, extra = {}) => {
  const at = extra.at ?? new Date(Date.parse('2026-03-01T11:00:00Z') + (++seq) * 60000).toISOString();
  return env.post('/api/measurements', { pondId: String(pond._id), source: 'live', recordedAt: at, values: Object.entries(vals).map(([k, value]) => ({ parameter: P(k)[0], value, unit: P(k)[1] })), ...extra.body });
};
const open = (q = {}) => env.db.collection('alerts').find({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }, ...q }).toArray();
const all = () => env.db.collection('alerts').find({}).sort({ createdAt: 1 }).toArray();
const actions = (r) => Object.fromEntries(r.body.alerts.map((a) => [`${a.parameter}${a.direction && a.parameter !== 'dissolved_oxygen' ? '.' + a.direction : ''}`, a.action]));

test('each parameter opens, escalates and resolves on its own', async () => {
  for (const [k, warn, crit, ok] of [['ph', 8.8, 9.4, 7.5], ['temp', 34, 36, 27], ['do', 2.5, 1.5, 5]]) {
    let r = await send({ [k]: warn }); assert.equal(r.status, 201);
    const w = (await open({ parameter: P(k)[0] }))[0];
    assert.equal(w.severity, 'WARNING'); assert.equal(w.origin, 'observed');
    r = await send({ [k]: crit }); assert.equal(r.body.alerts.at(-1).action, 'escalated');
    assert.equal((await open({ parameter: P(k)[0] }))[0].severity, 'CRITICAL');
    r = await send({ [k]: ok }); assert.equal(r.body.alerts.at(-1).action, 'resolved');
    assert.equal((await open({ parameter: P(k)[0] })).length, 0);
  }
  assert.equal((await all()).length, 3, 'one alert per parameter, kept as history');
});

test('messages and values are generated from the reading and the active rule', async () => {
  await send({ do: 2.7, ph: 8.8, temp: 34 });
  const msg = Object.fromEntries((await open()).map((a) => [a.parameter, a.message]));
  assert.equal(msg.dissolved_oxygen, 'Dissolved oxygen observed at 2.70 mg/L; warning threshold 3.00 mg/L.');
  assert.equal(msg.ph, 'pH observed at 8.80; configured upper warning limit 8.50.');
  assert.equal(msg.temperature, 'Water temperature observed at 34.0°C; configured upper warning limit 32.0°C.');
  const list = await env.get('/api/alerts');
  assert.deepEqual(Object.fromEntries(list.body.items.map((a) => [a.parameter, a.direction])), { dissolved_oxygen: 'low', ph: 'high', temperature: 'high' });
});

test('one reading triggers several alerts; a normal DO does not block pH or temperature', async () => {
  const r = await send({ do: 5.2, ph: 8.8, temp: 34 });
  assert.deepEqual(actions(r), { dissolved_oxygen: 'none', 'ph.high': 'opened', 'temperature.high': 'opened' });
  assert.deepEqual((await open()).map((a) => a.parameter).sort(), ['ph', 'temperature']);
  const r2 = await send({ do: 1.5, ph: 7.4, temp: 34 });
  assert.equal(actions(r2).dissolved_oxygen, 'opened'); assert.equal(actions(r2)['ph.high'], 'resolved'); assert.equal(actions(r2)['temperature.high'], 'updated');
});

test('recovery is independent: resolving pH leaves DO and temperature alerts open', async () => {
  await send({ do: 1.5, ph: 9.5, temp: 36 });
  assert.equal((await open()).length, 3);
  await send({ ph: 7.4 });
  assert.deepEqual((await open()).map((a) => a.parameter).sort(), ['dissolved_oxygen', 'temperature']);
  await send({ temp: 27 });
  assert.deepEqual((await open()).map((a) => a.parameter), ['dissolved_oxygen']);
});

test('a missing parameter never resolves its alert', async () => {
  await send({ ph: 9.5, temp: 36, do: 1.5 });
  await send({ do: 5 });                                  // DO recovers; pH and temperature are absent
  assert.deepEqual((await open()).map((a) => a.parameter).sort(), ['ph', 'temperature']);
  await send({ do: 5 });
  assert.equal((await open()).length, 2);
});

test('an invalid channel does not block valid ones: valid DO is evaluated, the bad pH is reported and not stored', async () => {
  const r = await send({ do: 1.5, ph: 15 });
  assert.equal(r.status, 201); assert.equal(r.body.rejectedValues.length, 1); assert.equal(r.body.rejectedValues[0].parameter, 'ph');
  assert.equal(r.body.alerts[0].action, 'opened'); assert.deepEqual(r.body.measurement.values.map((v) => v.parameter), ['dissolved_oxygen']);
  const r2 = await send({ ph: 8.8, temp: 99 });
  assert.equal(r2.status, 201); assert.equal(actions(r2)['ph.high'], 'opened'); assert.equal(r2.body.rejectedValues[0].parameter, 'temperature');
  assert.equal((await open({ parameter: 'temperature' })).length, 0);
  const r3 = await send({ ph: 15 });                      // nothing valid at all: rejected as a whole
  assert.equal(r3.status, 422); assert.equal((await env.db.collection('measurements').countDocuments()), 2);
});

test('non-finite and wrongly typed values can never resolve or create an alert', async () => {
  await send({ ph: 9.5 });
  for (const bad of [null, 'NaN', '7.4', true]) {
    const r = await env.post('/api/measurements', { pondId: String(pond._id), source: 'live', values: [{ parameter: 'ph', value: bad }] });
    assert.equal(r.status, 422);
  }
  assert.equal((await open({ parameter: 'ph' })).length, 1);
});

test('repeated violating readings update one open alert; duplicate requests and retries converge', async () => {
  for (let i = 0; i < 4; i++) await send({ ph: 8.8 + i * 0.01 });
  assert.equal((await all()).length, 1);
  const key = { idempotencyKey: 'retry-1' };
  const a = await send({ temp: 34 }, { body: key }); const b = await send({ temp: 34 }, { body: key });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.body.duplicate, true);
  assert.equal((await all()).filter((x) => x.parameter === 'temperature').length, 1);
  await Promise.all(Array.from({ length: 5 }, (_, i) => send({ do: 1.2 }, { at: `2026-03-01T11:3${i}:00Z` })));
  assert.equal((await open({ parameter: 'dissolved_oxygen' })).length, 1, 'concurrent requests never duplicate an open alert');
});

test('acknowledging does not resolve; a worse reading re-activates; recovery resolves; history is kept', async () => {
  await send({ ph: 8.8 });
  const a = (await open())[0];
  assert.equal((await env.patch(`/api/alerts/${a._id}/acknowledge`)).body.alert.status, 'ACKNOWLEDGED');
  await send({ ph: 8.85 });
  assert.equal((await open({ parameter: 'ph' }))[0].status, 'ACKNOWLEDGED');
  await send({ ph: 9.4 });
  assert.equal((await open({ parameter: 'ph' }))[0].status, 'ACTIVE');
  await send({ ph: 7.5 });
  assert.equal((await open()).length, 0);
  const hist = await all(); assert.equal(hist.length, 1); assert.equal(hist[0].status, 'RESOLVED');
});

test('low and high excursions are separate alert identities and cannot both be open', async () => {
  await send({ ph: 6.2 });
  let list = await open({ parameter: 'ph' }); assert.equal(list.length, 1); assert.equal(list[0].threshold, 6.5);
  const r = await send({ ph: 8.8 });
  assert.deepEqual(actions(r), { 'ph.high': 'opened', 'ph.low': 'resolved' });
  list = await open({ parameter: 'ph' }); assert.equal(list.length, 1); assert.equal(list[0].threshold, 8.5);
  assert.equal((await all()).length, 2);
});

test('boundary values do not alert: pH 6.5 / 8.5 and temperature 20 / 32', async () => {
  for (const v of [{ ph: 6.5 }, { ph: 8.5 }, { temp: 20 }, { temp: 32 }]) assert.equal((await send(v)).body.alerts[0].action, 'none');
  assert.equal((await all()).length, 0);
  assert.equal((await send({ ph: 8.501 })).body.alerts[0].action, 'opened');
  assert.equal((await send({ temp: 19.99 })).body.alerts[0].action, 'opened');
});

test('older readings cannot overwrite newer alert state, per parameter', async () => {
  await send({ ph: 7.4 }, { at: '2026-03-01T11:30:00Z' });
  const late = await send({ ph: 9.5 }, { at: '2026-03-01T11:00:00Z' });          // older than the newest pH reading
  assert.equal(late.status, 201); assert.equal(late.body.risk.ph.status, 'CRITICAL'); assert.equal(late.body.alertStateUpdated, false);
  assert.equal((await all()).length, 0, 'the stale excursion must not open an alert');
  await send({ ph: 9.5 }, { at: '2026-03-01T11:45:00Z' });
  await send({ ph: 7.4 }, { at: '2026-03-01T11:10:00Z' });                        // old normal must not resolve the newer alert
  assert.equal((await open({ parameter: 'ph' })).length, 1);
  // a late DO-only reading does not block evaluation of a pH reading it is older than in time but not in kind
  await send({ do: 5 }, { at: '2026-03-01T11:50:00Z' });
  const phOld = await send({ ph: 9.6 }, { at: '2026-03-01T11:44:00Z' });
  assert.equal(phOld.body.alertStateUpdated, false, 'a newer pH reading (11:45) exists');
  const tempFirst = await send({ temp: 36 }, { at: '2026-03-01T11:40:00Z' });
  assert.equal(actions(tempFirst)['temperature.high'], 'opened', 'no newer temperature reading exists, even though newer DO/pH readings do');
});

test('source isolation: replayed history, simulated and live readings keep separate alerts', async () => {
  const p = String(pond._id);
  await env.post('/api/measurements', { pondId: p, source: 'live', recordedAt: '2026-03-01T11:00:00Z', values: [{ parameter: 'ph', value: 9.5, unit: 'pH' }] });
  await env.post('/api/demo/measurement', { pondId: p, ph: 7.4, recordedAt: '2026-03-01T11:10:00Z' });   // simulated normal pH
  assert.equal((await open({ parameter: 'ph', dataSource: 'live' })).length, 1, 'a simulated recovery must not resolve the live alert');
  await env.db.collection('measurements').insertOne({ pondId: pond._id, recordedAt: new Date('2025-12-01T00:00:00Z'), receivedAt: new Date(), source: 'historical', createdAt: new Date(), values: [{ parameter: 'ph', value: 9.9, unit: 'pH' }] });
  const w = await env.get(`/api/replay/ponds/${p}/window?from=2025-11-30T00:00:00Z&to=2025-12-02T00:00:00Z`);
  assert.equal(w.body.items[0].risk.ph.status, 'CRITICAL'); assert.equal(w.body.items[0].risk.ph.direction, 'high');
  assert.equal((await all()).filter((a) => a.dataSource === 'historical').length, 0, 'replay never writes alerts');
  assert.equal((await open({ dataSource: 'live' })).length, 1);
});

test('forecast alerts keep their own identity and are never counted as observed', async () => {
  const stub = { ping: async () => ({ status: 'ready' }), predict: async () => ({ model: { bundle_id: 'b' }, warnings: [], forecasts: { 60: { do: { status: 'ok', value: 1.5, target_timestamp: '2026-03-01 18:00:00' }, ph: { status: 'ok', value: 9.9, target_timestamp: '2026-03-01 18:00:00' } } } }) };
  const e2 = await startEnv({ ml: stub });
  try {
    const p = await e2.makePond('TEST fc', { sourceId: 'x' });
    const r = await e2.post('/api/measurements', { pondId: String(p._id), source: 'live', values: [{ parameter: 'dissolved_oxygen', value: 5, unit: 'mg/L' }, { parameter: 'ph', value: 7.4, unit: 'pH' }] });
    assert.equal(r.body.inference.status, 'ok');
    const alerts = await e2.db.collection('alerts').find({}).toArray();
    assert.deepEqual(alerts.map((a) => [a.parameter, a.origin]), [['dissolved_oxygen', 'predicted']], 'only DO has forecast alerting; the pH forecast creates none');
    const sum = (await e2.get(`/api/ponds/${p._id}/summary`)).body;
    assert.equal(sum.riskStatus, 'NORMAL', 'a forecast-only condition does not change the observed pond status');
    assert.deepEqual(sum.openAlertItems.map((a) => a.origin), ['predicted']);
    const preds = (await e2.get(`/api/ponds/${p._id}/predictions`)).body.items;
    const byParam = Object.fromEntries(preds.map((x) => [x.parameter, x]));
    assert.equal(byParam.dissolved_oxygen.risk, 'CRITICAL'); assert.equal(byParam.dissolved_oxygen.direction, 'low');
    assert.equal(byParam.ph.risk, 'CRITICAL'); assert.equal(byParam.ph.direction, 'high');   // classified by the backend, though no pH forecast alert exists
  } finally { await e2.stop(); }
});

test('pond summary reports the worst fresh parameter and the open alert parameters', async () => {
  env.state.now = new Date('2026-03-01T12:00:00Z');
  await send({ do: 5, ph: 8.8, temp: 27 }, { at: '2026-03-01T11:58:00Z' });
  const s = (await env.get(`/api/ponds/${pond._id}/summary`)).body;
  assert.equal(s.riskStatus, 'WARNING'); assert.equal(s.parameters.ph.risk, 'WARNING'); assert.equal(s.parameters.dissolved_oxygen.risk, 'NORMAL');
  assert.deepEqual(s.openAlertItems.map((a) => [a.parameter, a.origin, a.direction]), [['ph', 'observed', 'high']]);
  assert.deepEqual(s.openAlerts, { WARNING: 1 });
});

test('GET /api/risk-rules reports all active rules and their provenance', async () => {
  const r = (await env.get('/api/risk-rules')).body;
  assert.deepEqual(Object.keys(r.parameters), ['dissolved_oxygen', 'ph', 'temperature', 'water_level']);
  assert.deepEqual(r.parameters.water_level, { label: 'Water level', unit: 'm', enabled: true, source: 'provisional_demo', acceptableRange: { min: 0.05, max: null }, lowWarning: 0.05, lowCritical: 0.01 });
  assert.deepEqual(r.parameters.temperature, { label: 'Water temperature', unit: 'C', enabled: true, source: 'provisional_demo', acceptableRange: { min: 20, max: 32 }, lowWarning: 20, lowCritical: 15, highWarning: 32, highCritical: 35 });
  assert.equal(r.parameters.dissolved_oxygen.source, 'project_default'); assert.deepEqual(r.dissolvedOxygen, { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 });
  assert.match(r.note, /PROVISIONAL DEMO/);
});
