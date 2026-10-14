import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from '../helpers.js';
import { bestWindow } from '../../src/services/replay.js';
import { createPythonWorker } from '../../src/ml/pythonWorker.js';

// Synthetic TEST series (clearly a test fixture): 15-minute DO/pH/temp for 3 days, one 2-hour hole, one duplicate timestamp.
const T0 = Date.parse('2026-01-10T00:00:00Z');
const at = (k) => new Date(T0 + k * 15 * 60_000);
const doAt = (k) => (k === 200 ? 1.5 : k === 201 ? 2.5 : 5 + Math.sin(k / 12));
const hole = (k) => k >= 150 && k < 158;
function rows(pondId, n = 288) {
  const out = [];
  for (let k = 0; k < n; k++) {
    if (hole(k)) continue;
    out.push({ pondId, recordedAt: at(k), receivedAt: new Date('2026-02-01T00:00:00Z'), source: 'historical', createdAt: new Date('2026-02-01T00:00:00Z'),
      values: [{ parameter: 'dissolved_oxygen', value: doAt(k), unit: 'mg/L' }, { parameter: 'ph', value: 8 + (k % 5) / 10, unit: 'pH' }, { parameter: 'temperature', value: 27 + (k % 7) / 10, unit: 'C' }],
      provenance: { dataset: 'test-set', pondSourceId: 'ara2_test', sourceTimestamp: `src-${k}`, sourceTimezone: 'Asia/Kolkata', qcFlags: [], dataQuality: [] } });
  }
  out.push({ ...out[10], _id: undefined, values: [{ parameter: 'dissolved_oxygen', value: 9.9, unit: 'mg/L' }] }); // duplicate timestamp, different value
  return out.map(({ _id, ...r }) => r);
}

let env; let pond; let calls; let mlMode = 'ok';
const spy = {
  ping: async () => ({ status: 'ready' }),
  predict: async (req) => {
    calls.push(req);
    if (mlMode === 'history') { const e = new Error('need 24h'); e.code = 'INSUFFICIENT_HISTORY'; throw e; }
    if (mlMode === 'fail') { const e = new Error('worker exited'); e.code = 'ML_UNAVAILABLE'; throw e; }
    const stamp = (m) => new Date(Date.parse(req.current.timestamp) + m * 60000 + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');
    return { model: { bundle_id: 'test-bundle' }, warnings: [], forecasts: Object.fromEntries([15, 60, 180].map((h, i) => [String(h), {
      do: { status: 'ok', value: [4, 2.5, 1.5][i], target_timestamp: stamp(h), selected_model: 'm' },
      ph: { status: 'ok', value: 8.1, target_timestamp: stamp(h) },
      temp: { status: 'withheld', value: null, reason: 'no recent reading' },
    }])) };
  },
};
const snapshot = async () => Object.fromEntries(await Promise.all(['measurements', 'predictions', 'alerts', 'modelRuns'].map(async (c) => [c, await env.db.collection(c).find({}).sort({ _id: 1 }).toArray()])));

before(async () => {
  env = await startEnv({ ml: spy });
  pond = await env.makePond('TEST replay pond', { sourceId: 'ara2_test', sourceDataset: 'test-set' });
  await env.db.collection('measurements').insertMany(rows(pond._id));
  // a simulated reading and a live alert that a replay must never touch
  await env.post('/api/demo/measurement', { pondId: String(pond._id), dissolvedOxygen: 1.2 });
});
after(() => env.stop());
const win = (from, to) => `/api/replay/ponds/${pond._id}/window?from=${from}&to=${to}`;

test('only ponds with historical data are listed, with coverage', async () => {
  await env.makePond('TEST empty pond');
  const r = await env.get('/api/replay/ponds');
  assert.equal(r.status, 200); assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].name, 'TEST replay pond'); assert.equal(r.body.items[0].records, 280 + 1);
});

test('coverage: presets are valid only where enough real records exist (24h yes, 7d no for 3 days of data)', async () => {
  const r = await env.get(`/api/replay/ponds/${pond._id}`);
  assert.equal(r.status, 200); assert.equal(r.body.duplicateTimestamps, 1);
  assert.equal(r.body.presets['24h'].valid, true); assert.equal(r.body.presets['7d'].valid, false);
  assert.ok(r.body.presets['24h'].coverage >= 0.8);
});

test('bestWindow picks the densest window and reports gaps without filling them', () => {
  const times = [0, 15, 30, 45, 200, 215, 230].map((m) => m * 60000);
  const w = bestWindow(times, 60 * 60000);
  assert.equal(w.records, 4); assert.equal(w.from.getTime(), 0); assert.equal(w.gaps, 0);
  assert.equal(bestWindow([], 1000), null);
  // pre-roll: the densest window overall starts at 0, but with 2 h of required earlier history only later starts qualify
  const dense = [0, 15, 30, 45, 60, 150, 165, 180, 195].map((m) => m * 60000);
  assert.equal(bestWindow(dense, 60 * 60000).from.getTime(), 0);
  assert.equal(bestWindow(dense, 60 * 60000, 120 * 60000).from.getTime(), 150 * 60000);
});

test('window: chronological, original values/timestamps, gap reported, duplicate skipped, backend risk attached', async () => {
  const from = at(190).toISOString(); const to = at(210).toISOString();
  const r = await env.get(win(from, to));
  assert.equal(r.status, 200); assert.equal(r.body.kind, 'historical_replay'); assert.equal(r.body.source, 'historical');
  const ts = r.body.items.map((i) => Date.parse(i.recordedAt));
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  const k200 = r.body.items.find((i) => i.recordedAt === at(200).toISOString());
  assert.equal(k200.values[0].value, 1.5); assert.equal(k200.sourceTimestamp, 'src-200'); assert.equal(k200.risk.dissolved_oxygen.status, 'CRITICAL');
  assert.equal(r.body.items.find((i) => i.recordedAt === at(201).toISOString()).risk.dissolved_oxygen.status, 'WARNING');
  assert.equal(k200.risk.ph.status, 'UNKNOWN'); // no invented pH/temperature rules
  const g = await env.get(win(at(145).toISOString(), at(165).toISOString()));
  assert.equal(g.body.gaps.length, 1); assert.equal(g.body.gaps[0].minutes, 135);
  const d = await env.get(win(at(5).toISOString(), at(15).toISOString()));
  assert.equal(d.body.duplicatesSkipped, 1);
  assert.equal(d.body.items.find((i) => i.recordedAt === at(10).toISOString()).values[0].value, doAt(10)); // the first record wins, not the duplicate
});

test('window validation: bad dates, inverted and oversized ranges, unknown pond', async () => {
  assert.equal((await env.get(win('nope', at(1).toISOString()))).status, 422);
  assert.equal((await env.get(win(at(10).toISOString(), at(5).toISOString()))).status, 422);
  assert.equal((await env.get(win('2026-01-01', '2026-02-01'))).status, 422);
  assert.equal((await env.get('/api/replay/ponds/000000000000000000000000/window?from=2026-01-10&to=2026-01-11')).status, 404);
  assert.equal((await env.get(`/api/replay/ponds/${pond._id}/window?from=2026-01-10&to=2026-01-11&extra=1`)).status, 422);
});

test('forecast: no future leakage, history excludes the instant itself, forecast risk uses the backend rules', async () => {
  calls = []; mlMode = 'ok';
  const T = at(200);
  const r = await env.post('/api/replay/forecast', { pondId: String(pond._id), at: T.toISOString() });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'ok'); assert.equal(r.body.persisted, false);
  assert.equal(calls.length, 1);
  const req = calls[0];
  assert.equal(req.current.timestamp, T.toISOString()); assert.equal(req.current.source, 'historical_replay');
  assert.deepEqual(req.current.measurements, { do: 1.5, ph: 8 + (200 % 5) / 10, temp: 27 + (200 % 7) / 10 });
  assert.ok(req.history.length > 0 && req.history.every((h) => Date.parse(h.timestamp) < +T), 'history must be strictly before the replay instant');
  const d60 = r.body.forecasts.find((f) => f.parameter === 'dissolved_oxygen' && f.horizonMinutes === 60);
  assert.equal(d60.value, 2.5); assert.equal(d60.risk, 'WARNING');
  assert.equal(new Date(d60.forecastFor).toISOString(), new Date(+T + 3600_000).toISOString());
  assert.equal(r.body.forecasts.find((f) => f.parameter === 'temperature').status, 'withheld');
  assert.deepEqual({ s: r.body.predictedRisk.status, h: r.body.predictedRisk.horizonMinutes }, { s: 'CRITICAL', h: 180 });
});

test('forecast failures are explicit and carry no invented values', async () => {
  for (const [mode, status] of [['history', 'insufficient_history'], ['fail', 'unavailable']]) {
    mlMode = mode;
    const r = await env.post('/api/replay/forecast', { pondId: String(pond._id), at: at(100).toISOString() });
    assert.equal(r.status, 200); assert.equal(r.body.status, status); assert.deepEqual(r.body.forecasts, []);
  }
  mlMode = 'ok';
});

test('forecast validation: unknown instant, malformed body, unknown pond', async () => {
  assert.equal((await env.post('/api/replay/forecast', { pondId: String(pond._id), at: at(153).toISOString() })).status, 404); // inside the hole: no record
  assert.equal((await env.post('/api/replay/forecast', { pondId: String(pond._id) })).status, 422);
  assert.equal((await env.post('/api/replay/forecast', { pondId: String(pond._id), at: at(5).toISOString(), values: [1] })).status, 422);
  assert.equal((await env.post('/api/replay/forecast', { pondId: '000000000000000000000000', at: at(5).toISOString() })).status, 404);
});

test('replay is read-only and repeatable: identical responses, no writes, other alerts and source rows untouched', async () => {
  const before = await snapshot();
  const q = win(at(190).toISOString(), at(210).toISOString());
  const a = await env.get(q); const b = await env.get(q);
  assert.deepEqual(a.body, b.body);
  const f1 = await env.post('/api/replay/forecast', { pondId: String(pond._id), at: at(200).toISOString() });
  const f2 = await env.post('/api/replay/forecast', { pondId: String(pond._id), at: at(200).toISOString() });
  assert.deepEqual(f1.body, f2.body);
  assert.deepEqual(await snapshot(), before);
  const open = await env.db.collection('alerts').find({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }).toArray();
  assert.ok(open.length >= 1 && open.every((x) => x.dataSource === 'simulated'));
});

test('REAL model: replay forecast works end to end on stored history', async (t) => {
  const worker = createPythonWorker({ timeoutMs: 60000 });
  try { await worker.ping(); } catch (e) { worker.close(); return t.skip(`python worker unavailable: ${e.message}`); }
  const e2 = await startEnv({ ml: worker });
  try {
    const p = await e2.makePond('ara2_test', { sourceId: 'ara2_test' });
    await e2.db.collection('measurements').insertMany(rows(p._id));
    const T = at(250);
    const r = await e2.post('/api/replay/forecast', { pondId: String(p._id), at: T.toISOString() });
    assert.equal(r.body.status, 'ok', JSON.stringify(r.body));
    const d60 = r.body.forecasts.find((f) => f.parameter === 'dissolved_oxygen' && f.horizonMinutes === 60);
    assert.ok(Number.isFinite(d60.value)); assert.equal(new Date(d60.forecastFor).toISOString(), new Date(+T + 3600_000).toISOString());
    assert.equal((await e2.db.collection('predictions').countDocuments()), 0);
    const early = await e2.post('/api/replay/forecast', { pondId: String(p._id), at: at(20).toISOString() });
    assert.equal(early.body.status, 'insufficient_history');
  } finally { worker.close(); await e2.stop(); }
});
