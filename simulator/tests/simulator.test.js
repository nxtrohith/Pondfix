import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPondGenerator } from '../src/generator.js';
import { createRunner } from '../src/runner.js';
import { measurementInput } from '../../backend/src/validators/measurement.js';

const T0 = Date.parse('2026-10-14T00:00:00Z');
const STEP = 15 * 60000;
const run = (seed, steps, initial) => {
  const g = createPondGenerator(seed, initial);
  return Array.from({ length: steps }, (_, i) => ({ at: T0 + i * STEP, v: Object.fromEntries(g.step(new Date(T0 + i * STEP)).map((x) => [x.parameter, x.value])) }));
};
const seeds = Array.from({ length: 17 }, (_, i) => `ara2_sim${i}`);

test('deterministic per seed, different between ponds', () => {
  assert.deepEqual(run('a', 50), run('a', 50));
  assert.notDeepEqual(run('a', 50), run('b', 50));
});

test('every reading is a valid measurement with all seven parameters', () => {
  for (const seed of seeds) for (const { at, v } of run(seed, 96 * 3)) {
    const values = Object.entries(v).map(([parameter, value]) => ({ parameter, value }));
    assert.equal(values.length, 7);
    const r = measurementInput.safeParse({ pondId: 'x', recordedAt: new Date(at).toISOString(), source: 'simulated', values });
    assert.ok(r.success, `${seed} ${JSON.stringify(v)} ${r.error?.message}`);
  }
});

test('values stay in plausible pond ranges over two weeks for all 17 ponds', () => {
  const lo = {}; const hi = {};
  for (const seed of seeds) for (const { v } of run(seed, 96 * 14)) for (const [k, x] of Object.entries(v)) { lo[k] = Math.min(lo[k] ?? Infinity, x); hi[k] = Math.max(hi[k] ?? -Infinity, x); }
  assert.ok(lo.temperature > 18 && hi.temperature < 36, `temp ${lo.temperature}-${hi.temperature}`);
  assert.ok(lo.dissolved_oxygen >= 0.3 && hi.dissolved_oxygen < 14, `do ${lo.dissolved_oxygen}-${hi.dissolved_oxygen}`);
  assert.ok(lo.ph > 6.5 && hi.ph < 9.3, `ph ${lo.ph}-${hi.ph}`);
  assert.ok(lo.water_level > 0.5 && hi.water_level < 2.2, `level ${lo.water_level}-${hi.water_level}`);
  assert.ok(lo.ammonia >= 0.01 && hi.ammonia < 4, `nh3 ${lo.ammonia}-${hi.ammonia}`);
  assert.ok(lo.nitrate >= 0 && hi.nitrate < 100, `no3 ${lo.nitrate}-${hi.nitrate}`);
  assert.ok(lo.turbidity >= 1 && hi.turbidity < 300, `ntu ${lo.turbidity}-${hi.turbidity}`);
});

test('daily cycle: afternoon oxygen, pH and temperature exceed pre-dawn values', () => {
  const rows = seeds.flatMap((s) => run(s, 96 * 7));
  const mean = (hourIst, k) => { const xs = rows.filter((r) => Math.round(((r.at / 3600000 + 5.5) % 24)) === hourIst).map((r) => r.v[k]); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  for (const k of ['dissolved_oxygen', 'ph', 'temperature']) assert.ok(mean(15, k) > mean(5, k), `${k}: ${mean(15, k)} vs ${mean(5, k)}`);
});

test('some oxygen dips reach warning level across the fleet, but not constantly', () => {
  const dos = seeds.flatMap((s) => run(s, 96 * 14).map((r) => r.v.dissolved_oxygen));
  const low = dos.filter((x) => x < 3).length / dos.length;
  assert.ok(low > 0 && low < 0.15, `fraction below 3 mg/L: ${low}`);
});

test('resumes from supplied readings and rejects out-of-order times', () => {
  const g = createPondGenerator('r', { dissolved_oxygen: 4.1, ph: 7.2, temperature: 27, water_level: 1.3, ammonia: 0.4 });
  const first = Object.fromEntries(g.step(new Date(T0)).map((x) => [x.parameter, x.value]));
  assert.equal(first.dissolved_oxygen, 4.1);
  assert.ok(Math.abs(first.water_level - 1.3) < 0.02, 'level resumes (sensor noise aside)');
  assert.throws(() => g.step(new Date(T0 - STEP)), RangeError);
});

// --- runner with a fake API ---
function fakeApi(ponds, latest = {}) {
  const posts = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace('http://api', '');
    const send = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (path === '/ponds') return send(200, { items: ponds });
    if (/\/measurements\/latest$/.test(path)) return send(200, latest[path.split('/')[2]] ?? { parameters: {} });
    if (path === '/measurements') { const b = JSON.parse(init.body); posts.push(b); return send(201, {}); }
    return send(404, { error: { message: 'nope' } });
  };
  return { fetchImpl, posts };
}
const pond = (id, dataSource, extra = {}) => ({ id, name: id, sourceId: `src_${id}`, status: 'active', dataSource, ...extra });

test('runner only posts for ponds set to Server, backfills, then adds one slot per interval, idempotently keyed', async () => {
  const api = fakeApi([pond('p1', 'simulator'), pond('p2', 'sensor'), pond('p3', undefined)]);
  let clock = Date.parse('2026-10-14T12:07:00Z');
  const runner = createRunner({ apiUrl: 'http://api', backfillHours: 2, fetchImpl: api.fetchImpl, now: () => new Date(clock), log: () => {} });
  const first = await runner.tick();
  assert.equal(first.ponds, 1);
  assert.equal(first.posted, 8); // 10:15 .. 12:00 = 8 slots
  assert.ok(api.posts.every((p) => p.pondId === 'p1' && p.source === 'simulated' && p.values.length === 7));
  assert.equal(new Set(api.posts.map((p) => p.idempotencyKey)).size, 8);
  assert.equal((await runner.tick()).posted, 0, 'same slot is not repeated');
  clock += 15 * 60000;
  assert.equal((await runner.tick()).posted, 1);
});

test('runner resumes after the last stored reading', async () => {
  const lastAt = '2026-10-14T11:00:00.000Z';
  const api = fakeApi([pond('p1', 'simulator')], { p1: { parameters: { dissolved_oxygen: { value: 4.4, recordedAt: lastAt, ageMinutes: 67 } } } });
  const runner = createRunner({ apiUrl: 'http://api', backfillHours: 24, fetchImpl: api.fetchImpl, now: () => new Date('2026-10-14T12:07:00Z'), log: () => {} });
  await runner.tick();
  assert.deepEqual(api.posts.map((p) => p.recordedAt), ['2026-10-14T11:15:00.000Z', '2026-10-14T11:30:00.000Z', '2026-10-14T11:45:00.000Z', '2026-10-14T12:00:00.000Z']);
});

test('switching a pond away and back starts fresh; an unreachable API advances nothing', async () => {
  const ponds = [pond('p1', 'simulator')];
  const api = fakeApi(ponds);
  let down = false;
  const fetchImpl = (u, i) => (down ? Promise.reject(new Error('ECONNREFUSED')) : api.fetchImpl(u, i));
  const runner = createRunner({ apiUrl: 'http://api', backfillHours: 1, fetchImpl, now: () => new Date('2026-10-14T12:07:00Z'), log: () => {} });
  down = true; await assert.rejects(runner.tick());
  down = false; assert.equal((await runner.tick()).posted, 4);
  ponds[0].dataSource = 'sensor'; assert.equal((await runner.tick()).ponds, 0);
  ponds[0].dataSource = 'simulator'; assert.equal((await runner.tick()).posted, 4, 'refilled from the backfill window, deduplicated by idempotency keys');
});

test('overlapping tick calls never run two passes at once (no duplicate or out-of-order posts)', async () => {
  const api = fakeApi([pond('p1', 'simulator')]);
  const slow = async (u, i) => { await new Promise((r) => setTimeout(r, 5)); return api.fetchImpl(u, i); };
  const runner = createRunner({ apiUrl: 'http://api', backfillHours: 2, fetchImpl: slow, now: () => new Date('2026-10-14T12:07:00Z'), log: () => {} });
  const results = await Promise.all([runner.tick(), runner.tick(), runner.tick()]);
  assert.equal(results.filter((r) => r.skipped).length, 2);
  assert.equal(api.posts.length, 8);
  assert.equal(new Set(api.posts.map((p) => p.idempotencyKey)).size, 8);
});
