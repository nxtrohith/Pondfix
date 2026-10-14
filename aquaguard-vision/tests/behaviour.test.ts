/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, det, range } from './helpers.ts';
import { computeStats, EMPTY_STATS } from '../src/lib/fishStats.ts';
import { advanceTimers, classifyBehaviour } from '../src/lib/behaviourClassifier.ts';
import { resolveConfig, DEFAULT_BEHAVIOUR_CONFIG } from '../src/lib/behaviourConfig.ts';
import { iou, type FishTrack } from '../src/lib/fishTracker.ts';

const stats = (r: Rig) => computeStats(r.last.tracks, r.last.detectionCount);
const assertInvariants = (r: Rig) => {
  const s = stats(r);
  assert.equal(s.active + s.lowActivity + s.possiblyMotionless, s.reliablyTrackedVisible);
  assert.equal(s.reliablyTrackedVisible + s.trackingUncertain + s.unknown, s.totalTracked);
  return s;
};
// Alternating +/-0.6 px on both axes: a 1.7 px swing from the anchor, inside the 2 px noise floor.
const jitter = (t: number) => (t % 2 === 0 ? 0.6 : -0.6);

test('A: a fish moving consistently stays ACTIVE and its speed is updated', () => {
  const r = new Rig();
  r.run(range(0, 12), (t) => [100 + 20 * t, 200]);
  assert.equal(r.only.behaviour, 'ACTIVE');
  assert.ok(Math.abs(r.only.speedPxPerSecond - 20) < 1, `speed ${r.only.speedPxPerSecond}`);
  assert.equal(r.only.trackId, 'FISH_001');
  assert.equal(assertInvariants(r).active, 1);
});

test('B: slow movement for longer than the threshold becomes LOW_ACTIVITY and is counted once', () => {
  const r = new Rig();
  r.run(range(0, 7), (t) => [100 + 3 * t, 200]);
  assert.equal(r.only.behaviour, 'ACTIVE', 'low timer has not yet run for 5 s');
  r.run(range(8, 12), (t) => [100 + 3 * t, 200]);
  assert.equal(r.only.behaviour, 'LOW_ACTIVITY');
  const s = assertInvariants(r);
  assert.deepEqual([s.active, s.lowActivity, s.possiblyMotionless], [0, 1, 0]);
  assert.ok(r.only.lowActivityDurationSeconds >= 5);
});

test('C: a visible, reliably tracked still fish becomes POSSIBLY_MOTIONLESS and leaves the low-activity count', () => {
  const r = new Rig();
  r.run(range(0, 12), () => [300, 200]);
  assert.equal(r.only.behaviour, 'LOW_ACTIVITY');
  assert.equal(assertInvariants(r).lowActivity, 1);
  const upTo19 = r.run(range(13, 19), () => [300, 200]);
  assert.equal(upTo19.tracks[0].behaviour, 'LOW_ACTIVITY', 'motionless needs 15 s of stillness');
  r.run(range(20, 22), () => [300, 200]);
  assert.equal(r.only.behaviour, 'POSSIBLY_MOTIONLESS');
  const s = assertInvariants(r);
  assert.deepEqual([s.active, s.lowActivity, s.possiblyMotionless], [0, 0, 1]);
  assert.ok(r.only.inactiveDurationSeconds >= 15);
});

test('D: a motionless fish that resumes moving recovers and the counts follow', () => {
  const r = new Rig();
  r.run(range(0, 22), () => [300, 200]);
  assert.equal(r.only.behaviour, 'POSSIBLY_MOTIONLESS');
  r.run(range(23, 40), (t) => [300 + 25 * (t - 22), 200]);
  assert.equal(r.only.behaviour, 'ACTIVE');
  const s = assertInvariants(r);
  assert.deepEqual([s.active, s.lowActivity, s.possiblyMotionless], [1, 0, 0]);
  assert.equal(r.only.inactiveDurationSeconds, 0);
});

test('D2: recovery reports POSSIBLY_MOTIONLESS -> LOW_ACTIVITY -> ACTIVE transitions in order', () => {
  const r = new Rig();
  r.run(range(0, 22), () => [300, 200]);
  const path: string[] = [];
  for (const t of range(23, 40)) {
    const u = r.frame(t, [det(300 + 25 * (t - 22), 200)]);
    for (const tr of u.transitions) path.push(`${tr.from}>${tr.to}`);
  }
  assert.deepEqual(path, ['POSSIBLY_MOTIONLESS>LOW_ACTIVITY', 'LOW_ACTIVITY>ACTIVE']);
});

test('E: a fish that disappears is TRACKING_UNCERTAIN, never motionless, and is dropped after expiry', () => {
  const r = new Rig();
  r.run(range(0, 12), () => [300, 200]);
  assert.equal(r.only.behaviour, 'LOW_ACTIVITY');
  for (const t of range(13, 22)) {
    r.frame(t, []);
    assert.equal(r.only.behaviour, 'TRACKING_UNCERTAIN', `t=${t}`);
    assert.equal(r.only.visible, false);
    const s = assertInvariants(r);
    assert.equal(s.possiblyMotionless + s.lowActivity + s.active, 0);
    assert.equal(s.reliablyTrackedVisible, 0);
  }
  r.frame(23.5, []);
  assert.equal(r.last.tracks.length, 0, 'expired after trackExpireS');
});

test('E2: a fish reacquired after a long gap restarts its inactivity timers instead of resuming as motionless', () => {
  const r = new Rig();
  r.run(range(0, 22), () => [300, 200]);
  assert.equal(r.only.behaviour, 'POSSIBLY_MOTIONLESS');
  r.frame(23, []); r.frame(24, []); r.frame(25, []);
  assert.equal(r.only.behaviour, 'TRACKING_UNCERTAIN');
  r.frame(26, [det(300, 200)]);
  assert.equal(r.only.trackId, 'FISH_001', 'identity is kept');
  assert.equal(r.only.behaviour, 'UNKNOWN', 'must re-observe before classifying again');
  assert.equal(r.only.inactiveDurationSeconds, 0);
});

test('E3: a gap inside missedGraceS keeps the timers running', () => {
  const r = new Rig({ missedGraceS: 4 });
  r.run(range(0, 12), () => [300, 200]);
  r.frame(13, []);
  assert.equal(r.only.behaviour, 'TRACKING_UNCERTAIN');
  r.frame(14, [det(300, 200)]);
  assert.equal(r.only.behaviour, 'LOW_ACTIVITY');
});

test('F: bounding-box jitter on a stationary fish is filtered and does not look like activity', () => {
  const r = new Rig();
  r.run(range(0, 12), (t) => [300 + jitter(t), 200 - jitter(t)]);
  assert.equal(r.only.speedPxPerSecond, 0);
  assert.equal(r.only.behaviour, 'LOW_ACTIVITY');
  assert.ok(r.only.displacementPx > 0, 'raw displacement is still reported, only the speed is filtered');
});

test('F2: jitter above the noise floor is counted as movement, proving the floor is configurable and real', () => {
  const r = new Rig({ noiseFloorPx: 0.5, noiseFloorBoxFraction: 0 });
  r.run(range(0, 12), (t) => [300 + jitter(t), 200]);
  assert.ok(r.only.speedPxPerSecond > 1);
});

test('G: several fish in different states each land in exactly one category', () => {
  const r = new Rig();
  for (const t of range(0, 22)) {
    r.frame(t, [det(100 + 20 * t, 100), det(100 + 3 * t, 300), det(400, 500)]);
  }
  const byY = Object.fromEntries(r.last.tracks.map((t) => [Math.round(t.centre.y), t]));
  assert.equal(byY[100].behaviour, 'ACTIVE');
  assert.equal(byY[300].behaviour, 'LOW_ACTIVITY');
  assert.equal(byY[500].behaviour, 'POSSIBLY_MOTIONLESS');
  assert.equal(new Set(r.last.tracks.map((t) => t.trackId)).size, 3);
  const s = assertInvariants(r);
  assert.deepEqual([s.active, s.lowActivity, s.possiblyMotionless, s.reliablyTrackedVisible, s.totalTracked], [1, 1, 1, 3, 3]);
});

test('H: movement is time-based and survives irregular frame intervals', () => {
  const times = [0, 0.5, 2, 3, 3.7, 5.5, 6, 8, 9, 9.4, 11, 12.5, 13, 15];
  const r = new Rig();
  r.run(times, (t) => [100 + 10 * t, 200]);
  assert.ok(Math.abs(r.only.speedPxPerSecond - 10) < 1.5, `speed ${r.only.speedPxPerSecond}`);
  assert.equal(r.only.behaviour, 'ACTIVE');
  assert.ok(Math.abs(r.only.elapsedSeconds - 2.0) < 1e-9, 'elapsed is the real gap between the last two observations');
  // identical motion sampled slowly gives the same speed
  const r2 = new Rig();
  r2.run(range(0, 15, 3), (t) => [100 + 10 * t, 200]);
  assert.ok(Math.abs(r2.only.speedPxPerSecond - 10) < 1.5, `speed ${r2.only.speedPxPerSecond}`);
});

test('I: an expired track leaves no stale counts', () => {
  const r = new Rig();
  r.run(range(0, 12), () => [300, 200]);
  assert.equal(stats(r).lowActivity, 1);
  r.frame(30, []);
  assert.deepEqual(r.last.expired, ['FISH_001']);
  assert.deepEqual(stats(r), EMPTY_STATS);
});

test('I2: an unconfirmed one-frame false positive is dropped without ever being counted as a fish', () => {
  const r = new Rig();
  r.frame(0, [det(100, 100)]);
  assert.equal(r.only.confirmed, false);
  assert.equal(r.only.behaviour, 'UNKNOWN');
  r.frame(1.5, []);
  assert.equal(r.last.tracks.length, 0);
  assert.deepEqual(r.last.expired, [], 'unconfirmed tracks are not reported as lost fish');
});

test('J: snapshots are immutable, transitions are reported in the same update, and stats follow immediately', () => {
  const r = new Rig();
  let before = r.run(range(0, 19), () => [300, 200]);
  assert.equal(before.tracks[0].behaviour, 'LOW_ACTIVITY');
  const earlier = before.tracks[0];
  const earlierHistory = earlier.history;
  const statsBefore = computeStats(before.tracks, 1);
  const after = r.frame(20, [det(300, 200)]);
  const afterStats = computeStats(after.tracks, 1);
  assert.equal(after.tracks[0].behaviour, 'POSSIBLY_MOTIONLESS');
  assert.deepEqual(after.transitions.map((t) => `${t.from}>${t.to}`), ['LOW_ACTIVITY>POSSIBLY_MOTIONLESS']);
  assert.deepEqual([afterStats.lowActivity, afterStats.possiblyMotionless], [0, 1]);
  // earlier snapshots were not mutated, and new ones are fresh objects, so React sees new references
  assert.equal(earlier.behaviour, 'LOW_ACTIVITY');
  assert.deepEqual([statsBefore.lowActivity, statsBefore.possiblyMotionless], [1, 0]);
  assert.notEqual(after.tracks, before.tracks);
  assert.notEqual(after.tracks[0], earlier);
  assert.notEqual(after.tracks[0].history, earlierHistory);
  assert.ok(earlierHistory.length < after.tracks[0].history.length);
});

test('tracking: identities persist for two fish swimming in opposite directions', () => {
  const r = new Rig();
  for (const t of range(0, 15)) r.frame(t, [det(100 + 15 * t, 150), det(700 - 15 * t, 250)]);
  assert.deepEqual(r.last.tracks.map((t) => t.trackId).sort(), ['FISH_001', 'FISH_002']);
  const left = r.last.tracks.find((t) => t.trackId === 'FISH_001')!;
  assert.ok(left.centre.x > 300 && Math.round(left.centre.y) === 150);
});

test('tracking: one detection is never shared by two tracks', () => {
  const r = new Rig();
  for (const t of range(0, 4)) r.frame(t, [det(300, 200), det(340, 200)]);
  assert.equal(r.last.tracks.length, 2);
  r.frame(5, [det(320, 200)]);
  const matched = r.last.tracks.filter((t) => t.visible);
  assert.equal(matched.length, 1, 'only one of the two tracks can own the single detection');
  assert.equal(r.last.tracks.filter((t) => t.behaviour === 'TRACKING_UNCERTAIN').length, 1);
});

test('tracking: bounded history and track count', () => {
  const r = new Rig({ historyMaxSamples: 10 });
  r.run(range(0, 60), (t) => [100 + 5 * t, 200]);
  assert.ok(r.only.history.length <= 10);
});

test('classifier: fixed evaluation order and hysteresis', () => {
  const cfg = resolveConfig();
  const base = { matched: true, confirmed: true, trackingConfidence: 1, sufficientHistory: true, lowSince: null, stillSince: null };
  const now = 100_000;
  assert.equal(classifyBehaviour({ ...base, matched: false, stillSince: 0, lowSince: 0 }, 'ACTIVE', 0, now, cfg), 'TRACKING_UNCERTAIN');
  assert.equal(classifyBehaviour({ ...base, confirmed: false, stillSince: 0 }, 'ACTIVE', 0, now, cfg), 'UNKNOWN');
  assert.equal(classifyBehaviour({ ...base, trackingConfidence: 0.1, stillSince: 0 }, 'ACTIVE', 0, now, cfg), 'TRACKING_UNCERTAIN');
  assert.equal(classifyBehaviour({ ...base, sufficientHistory: false, stillSince: 0 }, 'ACTIVE', 0, now, cfg), 'UNKNOWN');
  assert.equal(classifyBehaviour({ ...base, stillSince: 0, lowSince: 0 }, 'ACTIVE', 0, now, cfg), 'POSSIBLY_MOTIONLESS');
  assert.equal(classifyBehaviour({ ...base, lowSince: 0 }, 'ACTIVE', 0, now, cfg), 'LOW_ACTIVITY');
  assert.equal(classifyBehaviour({ ...base, lowSince: now - 4000 }, 'ACTIVE', 0, now, cfg), 'ACTIVE');
  assert.equal(classifyBehaviour({ ...base, lowSince: 0 }, 'ACTIVE', now - 500, now, cfg), 'ACTIVE', 'minimum state duration holds the state');
  // timers: between entry and exit thresholds nothing changes; at/after exit it clears
  const started = advanceTimers(0.5, true, null, null, 1000, cfg);
  assert.deepEqual(started, { lowSince: 1000, stillSince: 1000 });
  assert.deepEqual(advanceTimers(1.5, true, 1000, 1000, 2000, cfg), { lowSince: 1000, stillSince: 1000 }, 'speed 1.5 is inside motionless hysteresis band');
  assert.deepEqual(advanceTimers(2.5, true, 1000, 1000, 3000, cfg), { lowSince: 1000, stillSince: null });
  assert.deepEqual(advanceTimers(6, true, 1000, null, 4000, cfg), { lowSince: 1000, stillSince: null }, 'speed 6 is inside low hysteresis band');
  assert.deepEqual(advanceTimers(8, true, 1000, null, 5000, cfg), { lowSince: null, stillSince: null });
  assert.deepEqual(advanceTimers(0, false, null, null, 0, cfg), { lowSince: null, stillSince: null }, 'no timers without enough history');
});

test('config: exit thresholds are clamped to at least the entry thresholds; defaults match the spec', () => {
  const c = resolveConfig({ lowActivitySpeed: 10, lowActivityExitSpeed: 3 });
  assert.equal(c.lowActivityExitSpeed, 10);
  assert.deepEqual(
    [DEFAULT_BEHAVIOUR_CONFIG.observationWindowS, DEFAULT_BEHAVIOUR_CONFIG.lowActivitySpeed, DEFAULT_BEHAVIOUR_CONFIG.motionlessSpeed,
      DEFAULT_BEHAVIOUR_CONFIG.lowActivityMinS, DEFAULT_BEHAVIOUR_CONFIG.motionlessMinS, DEFAULT_BEHAVIOUR_CONFIG.missedGraceS],
    [5, 5, 1, 5, 15, 1],
  );
});

test('stats: computed from tracks only, each track once, uncertain/unknown never forced into a class', () => {
  const mk = (behaviour: FishTrack['behaviour']) => ({ behaviour }) as FishTrack;
  const s = computeStats([mk('ACTIVE'), mk('ACTIVE'), mk('LOW_ACTIVITY'), mk('POSSIBLY_MOTIONLESS'), mk('TRACKING_UNCERTAIN'), mk('UNKNOWN')], 5);
  assert.deepEqual(s, { visibleDetections: 5, reliablyTrackedVisible: 4, active: 2, lowActivity: 1, possiblyMotionless: 1, trackingUncertain: 1, unknown: 1, totalTracked: 6 });
  assert.deepEqual(computeStats([], 0), EMPTY_STATS);
});

test('iou', () => {
  assert.equal(iou({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 20, y1: 20, x2: 30, y2: 30 }), 0);
  assert.equal(iou({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 0, y1: 0, x2: 10, y2: 10 }), 1);
});
