// The backend explains what monitoring decided for every accepted reading, so a simulation that raises no alert is diagnosable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from '../helpers.js';

let env; let pond;
const lines = () => env.logs.filter((l) => l.startsWith('[INGEST]'));
const last = () => lines().at(-1);
const post = (values, extra = {}) => env.post('/api/measurements', { pondId: String(pond._id), source: 'simulated', values, ...extra });
const v = (parameter, value) => ({ parameter, value, unit: { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' }[parameter] });
const at = (min) => ({ recordedAt: new Date(+env.state.now + min * 60000).toISOString() });

before(async () => { env = await startEnv(); pond = await env.makePond('Pond 9'); });
after(async () => { await env?.stop(); });

test('a safe reading says it was safe and raised no alert', async () => {
  await post([v('temperature', 28), v('ph', 7.4)], at(0));
  assert.match(last(), /pond=\w+ \(Pond 9\) source=simulated/);
  assert.match(last(), /temperature=28 C NORMAL \(general limits\) -> safe, no alert/);
  assert.match(last(), /ph=7\.4 pH NORMAL .* -> safe, no alert/);
});

test('an unsafe reading says an alert was opened', async () => {
  await post([v('temperature', 33.5)], at(1));
  assert.match(last(), /temperature=33\.5 C WARNING .* -> alert opened/);
});

test('the same condition again says it was deduplicated', async () => {
  await post([v('temperature', 33.7)], at(2));
  assert.match(last(), /temperature=33\.7 C WARNING .* -> same condition still open: deduplicated, no new alert/);
  assert.equal((await env.get('/api/alerts?status=OPEN')).body.count, 1);
});

test('escalation and recovery are named', async () => {
  await post([v('temperature', 36)], at(3));
  assert.match(last(), /CRITICAL .* -> alert escalated/);
  await post([v('temperature', 27)], at(4));
  assert.match(last(), /temperature=27 C NORMAL .* -> alert resolved/);
});

test('an older reading says it was not evaluated because a newer one exists', async () => {
  await post([v('ph', 9.4)], at(-30));
  assert.match(last(), /ph=9\.4 pH CRITICAL .* -> not evaluated: a newer reading of this parameter already exists/);
});

test('a rejected value is reported next to the accepted ones', async () => {
  await post([v('temperature', 28.5), v('ph', 99)], at(5));
  assert.match(last(), /temperature=28\.5 C NORMAL/);
  assert.match(last(), /rejected values: ph \(/);
});

test('a replayed idempotent request says nothing was re-applied', async () => {
  const key = { idempotencyKey: 'log-test-1' };
  await post([v('temperature', 28)], { ...at(4), ...key });
  await post([v('temperature', 28)], { ...at(4), ...key });
  assert.match(last(), /DUPLICATE request, nothing re-applied/);
});
