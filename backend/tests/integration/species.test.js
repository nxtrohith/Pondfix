import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import { startEnv, doReading } from '../helpers.js';
import { createApp } from '../../src/app.js';

// TEST FIXTURE ONLY: arbitrary limits to exercise the engine; they are not aquaculture guidance.
const POLICY = { rohu: { version: 'rohu-test-v1', approvedBy: 'test fixture', approvedAt: '2026-01-01', source: 'integration test', limits: { do: { low_warn: 4, low_crit: 2.5 } } } };
let env; let dir; let tmp;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-species-'));
  dir = path.join(tmp, 'policies.json'); fs.writeFileSync(dir, JSON.stringify(POLICY));
  env = await startEnv({ configEnv: { AQUAGUARD_SPECIES_POLICIES: dir } });
});
after(async () => { await env.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });
beforeEach(async () => { await env.reset(); env.state.now = new Date('2026-03-01T12:00:00Z'); });

const setSpecies = (pond, body) => env.patch(`/api/ponds/${pond._id}/species`, body);
const open = async (pond) => (await env.get(`/api/ponds/${pond._id}/alerts?status=ALL`)).body.items;
const send = (pond, value, extra) => env.post('/api/measurements', doReading(pond._id, value, extra));

test('catalogue endpoint lists every species with its safety-profile status', async () => {
  const r = await env.get('/api/species-profiles');
  assert.equal(r.status, 200); assert.equal(r.body.items.length, 10);
  const by = Object.fromEntries(r.body.items.map((s) => [s.id, s.safetyProfile.status]));
  assert.equal(by.rohu, 'validated'); assert.equal(by.catla, 'reference_only'); assert.equal(by.pangasius, 'not_validated'); assert.equal(by.other, 'not_validated');
});

test('a species is saved, returned, and survives a backend restart; unrelated fields are untouched', async () => {
  const pond = await env.makePond('TEST persist', { sourceId: 'src-1', species: 'legacy note', area: { value: 2, unit: 'ha' } });
  const before = await env.db.collection('ponds').findOne({ _id: pond._id });
  const untouched = (await env.get(`/api/ponds/${pond._id}`)).body;
  assert.equal(untouched.speciesConfig.state, 'unconfigured', 'existing ponds stay unconfigured until a user selects a species');
  env.state.now = new Date('2026-03-02T09:00:00Z');
  const r = await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, String(pond._id)); assert.equal(r.body.speciesConfig.speciesProfileId, 'rohu'); assert.equal(r.body.speciesConfig.scientificName, 'Labeo rohita');
  assert.equal(r.body.speciesConfig.cultureLabel, 'Fish'); assert.equal(r.body.speciesConfig.safetyProfile.status, 'validated');

  const stored = await env.db.collection('ponds').findOne({ _id: pond._id });
  for (const k of ['_id', 'userId', 'name', 'sourceId', 'status', 'area', 'species', 'createdAt']) assert.deepEqual(stored[k], before[k], k);
  assert.equal(stored.speciesProfileId, 'rohu'); assert.equal(stored.cultureType, 'freshwater_fish'); assert.equal(stored.updatedAt.toISOString(), '2026-03-02T09:00:00.000Z');

  // "Restart": a brand-new app instance on the same database reads the persisted value.
  const app2 = createApp({ db: env.db, config: env.config, now: () => env.state.now, log: () => {}, dbTarget: 'atlas' });
  const s2 = await new Promise((res) => { const s = app2.listen(0, '127.0.0.1', () => res(s)); });
  const again = await (await fetch(`http://127.0.0.1:${s2.address().port}/api/ponds`)).json(); s2.close();
  assert.equal(again.items.find((p) => p.id === String(pond._id)).speciesConfig.speciesProfileId, 'rohu');
});

test('invalid configurations are rejected without touching the pond', async () => {
  const pond = await env.makePond('TEST invalid', { species: 'keep' });
  const snapshot = await env.db.collection('ponds').findOne({ _id: pond._id });
  for (const body of [{ mode: 'single', speciesProfileId: 'unicorn' }, { mode: 'single', speciesProfileId: 'Rohu' }, { mode: 'single', speciesProfileId: 'other' },
    { mode: 'polyculture', species: [{ speciesProfileId: 'rohu', proportionPercent: 50 }, { speciesProfileId: 'catla', proportionPercent: 40 }] }, { mode: 'single', speciesProfileId: 'rohu', area: 5 }, {}]) {
    const r = await setSpecies(pond, body);
    assert.equal(r.status, 422, JSON.stringify(body)); assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  }
  assert.deepEqual(await env.db.collection('ponds').findOne({ _id: pond._id }), snapshot);
  assert.equal((await env.patch(`/api/ponds/${'f'.repeat(24)}/species`, { mode: 'single', speciesProfileId: 'rohu' })).status, 404);
  assert.equal((await env.patch('/api/ponds/nope/species', { mode: 'single', speciesProfileId: 'rohu' })).status, 400);
});

test('polyculture and custom species save with exactly what was entered', async () => {
  const pond = await env.makePond('TEST poly');
  const r = await setSpecies(pond, { mode: 'polyculture', species: [{ speciesProfileId: 'rohu', proportionPercent: 50 }, { speciesProfileId: 'catla', proportionPercent: 50 }] });
  assert.equal(r.status, 200); assert.equal(r.body.speciesConfig.mode, 'polyculture'); assert.equal(r.body.speciesConfig.safetyProfile.ruleScope, 'general');
  const c = await setSpecies(pond, { mode: 'single', speciesProfileId: 'other', customSpeciesName: 'Tilapia' });
  assert.equal(c.body.speciesConfig.label, 'Tilapia'); assert.equal(c.body.speciesConfig.safetyProfile.status, 'not_validated');
  const stored = await env.db.collection('ponds').findOne({ _id: pond._id });
  assert.equal(stored.speciesComposition, undefined, 'switching mode removes stale polyculture fields');
  const u = await setSpecies(pond, { mode: 'unconfigured' });
  assert.equal(u.body.speciesConfig.state, 'unconfigured');
  assert.equal((await env.db.collection('ponds').findOne({ _id: pond._id })).speciesProfileId, undefined);
});

test('unconfigured pond: the general rules still alert, labelled as general, never healthy by default', async () => {
  const pond = await env.makePond('TEST general');
  assert.equal((await send(pond, 3.5)).body.risk.dissolved_oxygen.status, 'NORMAL');
  const r = await send(pond, 2.5, { recordedAt: '2026-03-01T12:01:00Z' });
  assert.equal(r.body.risk.dissolved_oxygen.status, 'WARNING'); assert.equal(r.body.risk.dissolved_oxygen.ruleScope, 'general');
  const [a] = await open(pond);
  assert.equal(a.ruleScope, 'general'); assert.equal(a.speciesLabel, undefined); assert.ok(a.explanation && a.recommendedAction);
  assert.match(a.explanation, /general safety rules/);
});

test('validated species policy drives the existing alert engine and is recorded on the alert', async () => {
  const pond = await env.makePond('TEST rohu');
  await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  const r = await send(pond, 3.5); // general rule: normal (>= 3.0); species policy: warning (< 4.0)
  assert.equal(r.status, 201); assert.equal(r.body.risk.dissolved_oxygen.status, 'WARNING'); assert.equal(r.body.risk.dissolved_oxygen.ruleScope, 'species');
  const [a] = await open(pond);
  assert.deepEqual([a.severity, a.threshold, a.ruleScope, a.speciesProfileId, a.speciesLabel, a.profileVersion, a.dataSource], ['WARNING', 4, 'species', 'rohu', 'Rohu', 'rohu-test-v1', 'live']);
  assert.equal(a.referenceRange.min, 5); assert.equal(a.referenceRange.kind, 'operating_target');
  assert.match(a.explanation, /species-specific limits \(rohu-test-v1\)/); assert.match(a.recommendedAction, /Verify the sensor reading/);
  // pond summary and list status use the same rules as the alert
  assert.equal((await env.get(`/api/ponds/${pond._id}/summary`)).body.riskStatus, 'WARNING');
  // critical boundary: exactly on the critical limit is a warning, strictly below is critical
  assert.equal((await send(pond, 2.5, { recordedAt: '2026-03-01T12:01:00Z' })).body.risk.dissolved_oxygen.status, 'WARNING');
  assert.equal((await send(pond, 2.49, { recordedAt: '2026-03-01T12:02:00Z' })).body.risk.dissolved_oxygen.status, 'CRITICAL');
});

test('species without an approved policy are never given invented limits or another species’ profile', async () => {
  const catla = await env.makePond('TEST catla'); const other = await env.makePond('TEST other');
  await setSpecies(catla, { mode: 'single', speciesProfileId: 'catla' });
  await setSpecies(other, { mode: 'single', speciesProfileId: 'other', customSpeciesName: 'Tilapia' });
  for (const p of [catla, other]) {
    assert.equal((await send(p, 3.5)).body.risk.dissolved_oxygen.status, 'NORMAL', 'rohu policy (4.0) is not borrowed');
    const r = await send(p, 2.5, { recordedAt: '2026-03-01T12:01:00Z' });
    assert.deepEqual([r.body.risk.dissolved_oxygen.status, r.body.risk.dissolved_oxygen.ruleScope], ['WARNING', 'general']);
  }
  const [a] = await open(catla);
  assert.equal(a.speciesLabel, 'Catla'); assert.equal(a.ruleScope, 'general'); assert.equal(a.profileVersion, undefined);
  assert.equal(a.threshold, 3, 'limit applied is the general one');
  assert.deepEqual([a.referenceRange.min, a.referenceRange.kind], [5, 'operating_target'], 'the species reference is shown as context only');
});

test('repeated evaluations do not duplicate alerts; acknowledging keeps the condition open; recovery resolves', async () => {
  const pond = await env.makePond('TEST lifecycle');
  env.state.now = new Date('2026-03-01T13:00:00Z');
  await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  for (let i = 0; i < 4; i++) await send(pond, 3.5, { recordedAt: `2026-03-01T12:0${i}:00Z` });
  let alerts = await open(pond); assert.equal(alerts.length, 1);
  const ack = await env.patch(`/api/alerts/${alerts[0].id}/acknowledge`);
  assert.equal(ack.body.alert.status, 'ACKNOWLEDGED');
  await send(pond, 3.4, { recordedAt: '2026-03-01T12:10:00Z' });
  alerts = await open(pond); assert.equal(alerts.length, 1); assert.equal(alerts[0].status, 'ACKNOWLEDGED', 'still the same open condition');
  await send(pond, 2.0, { recordedAt: '2026-03-01T12:11:00Z' });
  alerts = await open(pond); assert.equal(alerts.length, 1); assert.equal(alerts[0].status, 'ACTIVE', 'a worse condition re-opens it');
  await send(pond, 5.2, { recordedAt: '2026-03-01T12:12:00Z' });
  alerts = await open(pond); assert.equal(alerts.length, 1); assert.equal(alerts[0].status, 'RESOLVED');
});

test('changing species never rewrites or resolves existing alerts; later readings use the new profile', async () => {
  const pond = await env.makePond('TEST change');
  await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  await send(pond, 3.5);
  const [before] = await open(pond);
  const r = await setSpecies(pond, { mode: 'single', speciesProfileId: 'catla' });
  assert.equal(r.status, 200);
  const [after1] = await open(pond);
  assert.deepEqual([after1.status, after1.severity, after1.speciesLabel, after1.ruleScope, after1.profileVersion], [before.status, before.severity, 'Rohu', 'species', 'rohu-test-v1'], 'config change alone touches no alert');
  // next reading is judged by catla (general rules): 3.5 is normal, so the open condition resolves through the normal lifecycle,
  // and the resolved alert keeps the snapshot of what it was classified with.
  await send(pond, 3.5, { recordedAt: '2026-03-01T12:05:00Z' });
  const [done] = await open(pond);
  assert.equal(done.status, 'RESOLVED'); assert.equal(done.speciesLabel, 'Rohu'); assert.equal(done.profileVersion, 'rohu-test-v1');
});

test('simulated readings use the same species-aware pipeline and stay labelled as simulated', async () => {
  const pond = await env.makePond('TEST demo');
  await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  const r = await env.post('/api/demo/measurement', { pondId: String(pond._id), dissolvedOxygen: 3.5 });
  assert.equal(r.status, 201); assert.equal(r.body.demo.simulated, true); assert.equal(r.body.risk.dissolved_oxygen.ruleScope, 'species');
  const [a] = await open(pond); assert.equal(a.dataSource, 'simulated');
});

test('forecast-independent: species alerts work with ML disabled (no worker is configured here)', async () => {
  const pond = await env.makePond('TEST noml');
  await setSpecies(pond, { mode: 'single', speciesProfileId: 'rohu' });
  const r = await send(pond, 3.0);
  assert.equal(r.body.inference.status, 'disabled'); assert.equal(r.body.risk.dissolved_oxygen.status, 'WARNING');
});
