// The dedicated demo pond ("Pond 18") and its guided four-stage alert scenario.
//
// Isolation: the demo pond has a fixed _id and is the ONLY pond these functions ever touch. No function takes a pond id from the caller, so
// a request cannot aim a reset (or anything else) at a real pond. Nothing is ever deleted: a reset resolves open demo alerts through the
// normal recovery path (a normal reading) and keeps all measurements and alerts as history.
//
// Truthfulness: every reading goes through ingestMeasurement() with source "simulated", exactly like normal telemetry (validation,
// persistence, classification, alert lifecycle, realtime publication, optional forecast). Alerts are never inserted directly. The risk
// rules are the source of truth: each stage records whether the backend's verdict matched the expectation, and a mismatch is reported,
// never forced.
//
// Concurrency: a stage transition is claimed with an atomic compare-and-set on the stored stage BEFORE its reading is ingested, and
// `advance` must name the stage it is advancing from, so a double tap or a second presenter gets 409 instead of skipping a stage.
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { parse } from '../utils/params.js';
import { ApiError, conflict, notFound } from '../utils/errors.js';
import { ingestMeasurement } from './ingestion.js';
import { buildSpeciesUpdate } from './speciesProfiles.js';
import { pondSnapshot, publishPondUpdate } from './pondSync.js';
import { serializePond, serializeAlert, withPondNames } from './queries.js';

export const DEMO_POND_ID = new ObjectId('00000000000000000000d0d0');
export const DEMO_USER_ID = new ObjectId('00000000000000000000a001'); // same demo farmer the FWI import uses
export const DEMO_POND_NAME = 'Pond 18'; // shown as the 18th pond; isDemo=true and sourceId keep it distinguishable from the real 17
export const DEMO_SOURCE_ID = 'aquaguard-demo-pond';
const BASELINE_KEY = 'demo-baseline-v1';

const reading = (dissolved_oxygen, extra = {}) => ({ dissolved_oxygen, ...extra });
/** Stage readings. Only dissolved oxygen changes after stage A, so the story is one parameter and one alert. */
export const STAGES = Object.freeze([
  { stage: 'A', title: 'Normal conditions', expected: 'NORMAL', values: reading(6.0, { ph: 7.5, temperature: 28, water_level: 1.2 }), summary: 'Healthy pond. No alert opens.' },
  { stage: 'B', title: 'Warning', expected: 'WARNING', values: reading(2.8), summary: 'Dissolved oxygen falls below the warning limit. A warning alert opens.' },
  { stage: 'C', title: 'Critical', expected: 'CRITICAL', values: reading(1.5), summary: 'Oxygen falls below the critical limit. The same alert escalates; no duplicate opens.' },
  { stage: 'D', title: 'Recovery', expected: 'NORMAL', values: reading(5.5), summary: 'Oxygen recovers. The alert resolves and stays in history.' },
]);
const UNIT = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C', water_level: 'm' };
const toValues = (v) => Object.entries(v).map(([parameter, value]) => ({ parameter, value, unit: UNIT[parameter] }));
const stageOf = (letter) => STAGES.find((s) => s.stage === letter);

const empty = z.object({}).strict();
const advanceBody = z.object({ fromStage: z.enum(['A', 'B', 'C']) }).strict();

/** Demo writes need a dedicated database (name contains "demo" or "test") unless DEMO_ALLOW_ANY_DB=true. */
export const dedicatedDatabase = (db, config) => config.demoAllowAnyDb || /demo|test/i.test(db.databaseName);
export function assertDedicated(db, config) {
  if (!dedicatedDatabase(db, config)) throw new ApiError(403, 'DEMO_DB_NOT_DEDICATED', 'the demo pond writes simulated data, so it only runs in a dedicated database: set MONGODB_DB to a name containing "demo" (or set DEMO_ALLOW_ANY_DB=true to override)');
}

// One in-process queue for state-changing demo operations; the compare-and-set below protects other processes too.
let chain = Promise.resolve();
const serialize = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

const newRunId = (at) => `demo-${at.toISOString().replace(/\D/g, '').slice(0, 14)}-${new ObjectId().toHexString().slice(-6)}`;

/** Creates the demo pond if missing. Never touches another pond; safe to call repeatedly. -> { pond, created } */
export async function ensureDemoPond(deps, body = {}) {
  parse(empty, body);
  const { db, now = () => new Date() } = deps;
  const at = now();
  const clash = await db.collection('ponds').findOne({ _id: { $ne: DEMO_POND_ID }, $or: [{ name: DEMO_POND_NAME, userId: DEMO_USER_ID }, { sourceId: DEMO_SOURCE_ID }] }, { projection: { _id: 1 } });
  if (clash) throw conflict(`another pond already uses the name "${DEMO_POND_NAME}" or the source id "${DEMO_SOURCE_ID}"; it is not the demo pond, so nothing was changed`);
  await db.collection('users').updateOne({ _id: DEMO_USER_ID }, { $setOnInsert: { name: 'AquaGuard Demo Farmer', createdAt: at, updatedAt: at } }, { upsert: true });
  const { set: species } = buildSpeciesUpdate({ mode: 'single', speciesProfileId: deps.config.demoSpecies ?? 'rohu' });
  const r = await db.collection('ponds').updateOne({ _id: DEMO_POND_ID }, { $setOnInsert: {
    userId: DEMO_USER_ID, name: DEMO_POND_NAME, status: 'active', sourceId: DEMO_SOURCE_ID, sourceDataset: 'aquaguard-demo', isDemo: true,
    location: { description: 'Simulated pond for live alert demonstrations. Not a physical pond.' },
    ...species, speciesConfiguredAt: at, demo: { status: 'idle', revision: 0, updatedAt: at }, createdAt: at, updatedAt: at,
  } }, { upsert: true });
  const created = r.upsertedCount === 1;
  if (created) await publishPondUpdate(deps, DEMO_POND_ID);
  return { pond: await db.collection('ponds').findOne({ _id: DEMO_POND_ID }), created };
}

async function ingestStage(deps, def, runId, label) {
  const out = await ingestMeasurement(deps, { pondId: String(DEMO_POND_ID), source: 'simulated', values: toValues(def.values) }, {
    strictValues: true, measurementExtra: runId ? { demoRunId: runId } : undefined, alertExtra: runId ? { demoRunId: runId } : undefined,
    extraMeta: { simulated: true, demo: true, stage: def.stage, runId: runId ?? null, label, note: 'SIMULATED demonstration reading, not a physical sensor observation.' },
  });
  const verdict = out.body.risk?.dissolved_oxygen?.status ?? 'UNKNOWN';
  const actions = (out.body.alerts ?? []).filter((a) => a.action && a.action !== 'none').map((a) => `${a.parameter}:${a.action}`);
  return { out, entry: { stage: def.stage, at: out.body.measurement.recordedAt, status: verdict, expected: def.expected, matched: verdict === def.expected, actions } };
}

/** Idempotent setup: pond + one SIMULATED baseline reading (deduplicated by an idempotency key, so reruns add nothing). */
export function setup(deps, body) {
  return serialize(async () => {
    assertDedicated(deps.db, deps.config);
    const { pond, created } = await ensureDemoPond(deps, body);
    const base = STAGES[0];
    const { out } = await ingestStageBaseline(deps, base);
    return { created, baselineCreated: !out.body.duplicate, pondId: String(pond._id) };
  });
}
async function ingestStageBaseline(deps, base) {
  const out = await ingestMeasurement(deps, { pondId: String(DEMO_POND_ID), source: 'simulated', idempotencyKey: BASELINE_KEY, values: toValues(base.values) }, {
    strictValues: true, extraMeta: { simulated: true, demo: true, stage: 'baseline', note: 'SIMULATED baseline reading, not a physical sensor observation.' },
  });
  return { out };
}

/** Starts a new run at stage A. Refused while a run is in progress. */
export function start(deps, body) {
  return serialize(async () => {
    parse(empty, body ?? {});
    assertDedicated(deps.db, deps.config);
    const { db, now = () => new Date() } = deps;
    await ensureDemoPond(deps);
    const at = now(); const runId = newRunId(at);
    const claimed = await db.collection('ponds').findOneAndUpdate(
      { _id: DEMO_POND_ID, 'demo.status': { $ne: 'running' } },
      { $set: { 'demo.status': 'running', 'demo.runId': runId, 'demo.stage': 'A', 'demo.startedAt': at, 'demo.updatedAt': at, 'demo.lastEventAt': at, 'demo.history': [] }, $inc: { 'demo.revision': 1 } },
    );
    if (!claimed) throw conflict('a demo run is already in progress: advance it to the end or reset it first');
    try {
      const { entry } = await ingestStage(deps, STAGES[0], runId, STAGES[0].title);
      await db.collection('ponds').updateOne({ _id: DEMO_POND_ID, 'demo.runId': runId }, { $push: { 'demo.history': { $each: [{ ...entry, at: new Date(entry.at) }], $slice: -16 } }, $set: { 'demo.lastEventAt': new Date(entry.at) } });
    } catch (e) {
      await db.collection('ponds').updateOne({ _id: DEMO_POND_ID, 'demo.runId': runId }, { $set: { 'demo.status': 'idle', 'demo.updatedAt': now() }, $unset: { 'demo.stage': '', 'demo.runId': '' } });
      throw e;
    }
    return { runId, stage: 'A' };
  });
}

/** Moves from the named stage to the next one and ingests its reading. 409 if the run is not at `fromStage`. */
export function advance(deps, body) {
  return serialize(async () => {
    const { fromStage } = parse(advanceBody, body ?? {});
    assertDedicated(deps.db, deps.config);
    const { db, now = () => new Date() } = deps;
    const next = STAGES[STAGES.findIndex((s) => s.stage === fromStage) + 1];
    const at = now();
    const claimed = await db.collection('ponds').findOneAndUpdate(
      { _id: DEMO_POND_ID, 'demo.status': 'running', 'demo.stage': fromStage },
      { $set: { 'demo.stage': next.stage, 'demo.updatedAt': at, ...(next.stage === 'D' ? { 'demo.status': 'complete' } : {}) }, $inc: { 'demo.revision': 1 } },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      const cur = await db.collection('ponds').findOne({ _id: DEMO_POND_ID }, { projection: { demo: 1 } });
      if (!cur) throw notFound('the demo pond does not exist yet: run setup first');
      throw conflict(cur.demo?.status === 'running' ? `the run is at stage ${cur.demo.stage}, not ${fromStage}: refresh and try again` : 'no demo run is in progress: start one first');
    }
    const runId = claimed.demo.runId;
    try {
      const { entry } = await ingestStage(deps, next, runId, next.title);
      await db.collection('ponds').updateOne({ _id: DEMO_POND_ID, 'demo.runId': runId }, { $push: { 'demo.history': { $each: [{ ...entry, at: new Date(entry.at) }], $slice: -16 } }, $set: { 'demo.lastEventAt': new Date(entry.at) } });
    } catch (e) {
      await db.collection('ponds').updateOne({ _id: DEMO_POND_ID, 'demo.runId': runId, 'demo.stage': next.stage }, { $set: { 'demo.stage': fromStage, 'demo.status': 'running', 'demo.updatedAt': now() } }); // let the presenter retry
      throw e;
    }
    return { runId, stage: next.stage, complete: next.stage === 'D' };
  });
}

/**
 * Stops the run and returns the demo pond to idle. If the pond is not already healthy it submits one normal SIMULATED reading so open
 * demo alerts resolve through the normal recovery path. Deletes nothing. Idempotent.
 */
export function reset(deps, body) {
  return serialize(async () => {
    parse(empty, body ?? {});
    assertDedicated(deps.db, deps.config);
    const { db, now = () => new Date() } = deps;
    const pond = await db.collection('ponds').findOne({ _id: DEMO_POND_ID });
    if (!pond) throw notFound('the demo pond does not exist yet: run setup first');
    const open = await db.collection('alerts').countDocuments({ pondId: DEMO_POND_ID, status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } });
    let recovered = false;
    if (open > 0) { await ingestStage(deps, { ...STAGES[0], stage: 'A' }, pond.demo?.runId, 'Reset (recovery reading)'); recovered = true; }
    await db.collection('ponds').updateOne({ _id: DEMO_POND_ID }, { $set: { 'demo.status': 'idle', 'demo.updatedAt': now(), 'demo.history': [] }, $unset: { 'demo.stage': '', 'demo.runId': '' }, $inc: { 'demo.revision': 1 } });
    return { reset: true, recovered, openAlertsBefore: open };
  });
}

/** Read-only view for the demo screens. Never exposes phone numbers, tokens or provider messages. */
export async function status(deps) {
  const { db, config, now = () => new Date() } = deps;
  const guard = { dedicatedDatabase: dedicatedDatabase(db, config), overridden: config.demoAllowAnyDb };
  const pond = await db.collection('ponds').findOne({ _id: DEMO_POND_ID });
  const base = { enabled: true, simulated: true, guard, stages: STAGES.map(({ stage, title, expected, values, summary }) => ({ stage, title, expected, values, summary })) };
  if (!pond) return { ...base, exists: false, run: { status: 'idle', stage: null, history: [] }, alerts: [] };
  const d = pond.demo ?? { status: 'idle' };
  const alertRows = await db.collection('alerts').find({ pondId: DEMO_POND_ID }).sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
  const at = now();
  return {
    ...base, exists: true,
    pond: serializePond(pond),
    snapshot: await pondSnapshot(db, config, pond, at),
    run: {
      runId: d.runId ?? null, status: d.status ?? 'idle', stage: d.stage ?? null, revision: d.revision ?? 0, startedAt: d.startedAt ?? null, lastEventAt: d.lastEventAt ?? null,
      history: (d.history ?? []).map((h) => ({ ...h, title: stageOf(h.stage)?.title ?? h.stage })),
    },
    alerts: await withPondNames(db, alertRows.map(serializeAlert)),
  };
}
