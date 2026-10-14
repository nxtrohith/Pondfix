/**
 * fishTracker.ts — Multi-object tracker plus per-track movement measurement.
 *
 * Association: every (track, detection) pair inside the gate is scored from box overlap (IoU) and the distance between the
 * detection centroid and the track's last / motion-predicted centroid; pairs are then taken best-first so each detection
 * and each track is used at most once (two fish can never share an ID). Unmatched detections start tentative tracks that are
 * only counted as fish after `minHitsToConfirm` sightings; unmatched tracks are kept, flagged TRACKING_UNCERTAIN, until
 * `trackExpireS` has passed.
 *
 * Movement: all timing uses the real capture timestamps passed in, never an assumed frame rate. Centroid movement below the
 * jitter floor is ignored; larger movement is measured from an anchor point (so slow steady drift is not lost to the floor)
 * and summed over a rolling window to give a smoothed speed in image-plane pixels per second.
 */

import { resolveConfig, type BehaviourConfig } from './behaviourConfig.ts';
import { advanceTimers, classifyBehaviour, type BehaviourState } from './behaviourClassifier.ts';

export type { BehaviourState } from './behaviourClassifier.ts';

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  bbox: BBox;
  confidence: number;
  label: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** Immutable snapshot handed to the UI; a fresh object (and fresh arrays) on every update. */
export interface FishTrack {
  trackId: string;
  bbox: BBox;
  centre: Point;
  prevCentre: Point | null;
  /** Detector confidence of the latest matched detection (not tracking confidence, not behaviour). */
  detectionConfidence: number;
  /** Alias of detectionConfidence kept for existing consumers. */
  confidence: number;
  /** 0..1 smoothed quality of the frame-to-frame association (separate from detection confidence). */
  trackingConfidence: number;
  /** Displacement (reference px) between the last two valid observations. */
  displacementPx: number;
  /** Seconds between the last two valid observations. */
  elapsedSeconds: number;
  /** Smoothed image-plane speed over the observation window (reference px/s). Not a physical speed. */
  speedPxPerSecond: number;
  directionDeg: number | null;
  behaviour: BehaviourState;
  /** Seconds of sustained speed below the low-activity threshold (0 when not low). */
  lowActivityDurationSeconds: number;
  /** Seconds of sustained speed below the motionless threshold: apparent inactivity (0 when moving). */
  inactiveDurationSeconds: number;
  timeInStateSeconds: number;
  timeSinceLastSeenSeconds: number;
  /** Matched to a detection in the latest processed frame. */
  visible: boolean;
  /** Seen enough times to be treated as a real fish rather than a one-frame false positive. */
  confirmed: boolean;
  /** visible && confirmed && association quality acceptable. */
  trackingReliable: boolean;
  hits: number;
  missedFrames: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Bounded recent centroid history. */
  history: Sample[];
}

export interface BehaviourTransition {
  trackId: string;
  from: BehaviourState;
  to: BehaviourState;
  at: number;
  speedPxPerSecond: number;
  lowActivityDurationSeconds: number;
  inactiveDurationSeconds: number;
  trackingReliable: boolean;
}

export interface TrackerUpdate {
  tracks: FishTrack[];
  transitions: BehaviourTransition[];
  /** Confirmed tracks removed in this update (lost for longer than trackExpireS). */
  expired: string[];
  /** Detections accepted into this update (after the confidence filter). */
  detectionCount: number;
}

interface Internal {
  id: string;
  bbox: BBox;
  centre: Point;
  prevCentre: Point | null;
  prevSeenAt: number | null;
  velocity: Point; // damped px/s, used only to predict where the fish will be next
  detectionConfidence: number;
  trackingConfidence: number;
  displacementPx: number;
  elapsedSeconds: number;
  speed: number;
  directionDeg: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  hits: number;
  confirmed: boolean;
  matched: boolean;
  missedFrames: number;
  anchor: Point;
  moves: { t: number; d: number }[];
  samples: Sample[];
  sufficientHistory: boolean;
  lowSince: number | null;
  stillSince: number | null;
  behaviour: BehaviourState;
  stateSince: number;
}

const centroid = (b: BBox): Point => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const diagonal = (b: BBox) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
const angleDeg = (from: Point, to: Point) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

export function iou(a: BBox, b: BBox): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

export class FishTracker {
  private tracks = new Map<string, Internal>();
  private nextId = 1;
  readonly config: BehaviourConfig;

  constructor(overrides: Partial<BehaviourConfig> = {}) {
    this.config = resolveConfig(overrides);
  }

  /** `nowMs` is the capture time of the frame (not the time inference finished). Call once per processed frame, even with no detections. */
  update(rawDetections: Detection[], nowMs: number): TrackerUpdate {
    const cfg = this.config;
    const detections = rawDetections.filter((d) => d.confidence >= cfg.minDetectionConfidence);
    const before = new Map<string, BehaviourState>([...this.tracks].map(([id, t]) => [id, t.behaviour]));

    // Score every plausible pair, then take them best-first (greedy one-to-one assignment).
    const pairs: { id: string; det: number; score: number }[] = [];
    for (const t of this.tracks.values()) {
      const dtS = Math.max((nowMs - t.lastSeenAt) / 1000, 0);
      const useMotion = t.confirmed && dtS > 0 && dtS <= 3;
      const gate = Math.max(cfg.minGatePx, cfg.gateDiagonalFactor * diagonal(t.bbox));
      const predicted: Point = useMotion
        ? { x: t.centre.x + t.velocity.x * dtS, y: t.centre.y + t.velocity.y * dtS }
        : t.centre;
      detections.forEach((d, i) => {
        const c = centroid(d.bbox);
        const dd = Math.min(dist(t.centre, c), dist(predicted, c));
        const overlap = iou(t.bbox, d.bbox);
        if (dd > gate && overlap < 0.3) return;
        pairs.push({ id: t.id, det: i, score: 0.5 * overlap + 0.5 * Math.max(0, 1 - dd / gate) });
      });
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedTracks = new Set<string>();
    const usedDets = new Set<number>();
    for (const p of pairs) {
      if (usedTracks.has(p.id) || usedDets.has(p.det)) continue;
      usedTracks.add(p.id);
      usedDets.add(p.det);
      this.observe(this.tracks.get(p.id)!, detections[p.det], p.score, nowMs);
    }

    const expired: string[] = [];
    for (const t of [...this.tracks.values()]) {
      if (usedTracks.has(t.id)) continue;
      const gapS = (nowMs - t.lastSeenAt) / 1000;
      if (!t.confirmed || gapS > cfg.trackExpireS) {
        this.tracks.delete(t.id);
        if (t.confirmed) expired.push(t.id);
        continue;
      }
      t.matched = false;
      t.missedFrames += 1;
      t.trackingConfidence = Math.max(0, t.trackingConfidence * 0.8);
      this.setBehaviour(t, nowMs);
    }

    detections.forEach((d, i) => {
      if (!usedDets.has(i)) this.spawn(d, nowMs);
    });

    const transitions: BehaviourTransition[] = [];
    const tracks: FishTrack[] = [];
    for (const t of this.tracks.values()) {
      const prev = before.get(t.id);
      if (prev !== undefined && prev !== t.behaviour) {
        transitions.push({
          trackId: t.id, from: prev, to: t.behaviour, at: nowMs, speedPxPerSecond: t.speed,
          lowActivityDurationSeconds: this.duration(t.lowSince, t),
          inactiveDurationSeconds: this.duration(t.stillSince, t),
          trackingReliable: this.reliable(t),
        });
      }
      tracks.push(this.snapshot(t, nowMs));
    }
    return { tracks, transitions, expired, detectionCount: detections.length };
  }

  reset() {
    this.tracks.clear();
    this.nextId = 1;
  }

  private spawn(d: Detection, now: number) {
    const id = `FISH_${String(this.nextId++).padStart(3, '0')}`;
    const c = centroid(d.bbox);
    this.tracks.set(id, {
      id, bbox: d.bbox, centre: c, prevCentre: null, prevSeenAt: null, velocity: { x: 0, y: 0 },
      detectionConfidence: d.confidence, trackingConfidence: 0.8, displacementPx: 0, elapsedSeconds: 0, speed: 0,
      directionDeg: null, firstSeenAt: now, lastSeenAt: now, hits: 1, confirmed: this.config.minHitsToConfirm <= 1,
      matched: true, missedFrames: 0, anchor: c, moves: [], samples: [{ t: now, x: c.x, y: c.y }],
      sufficientHistory: false, lowSince: null, stillSince: null, behaviour: 'UNKNOWN', stateSince: now,
    });
  }

  private observe(t: Internal, d: Detection, score: number, now: number) {
    const cfg = this.config;
    const c = centroid(d.bbox);
    const dtS = (now - t.lastSeenAt) / 1000;
    const gapMs = now - t.lastSeenAt;

    t.prevCentre = t.centre;
    t.prevSeenAt = t.lastSeenAt;
    t.elapsedSeconds = Math.max(dtS, 0);
    t.displacementPx = dist(t.centre, c);
    const noise = Math.max(cfg.noiseFloorPx, cfg.noiseFloorBoxFraction * diagonal(d.bbox));
    if (dtS > 0) {
      t.velocity = { x: 0.5 * t.velocity.x + 0.5 * ((c.x - t.centre.x) / dtS), y: 0.5 * t.velocity.y + 0.5 * ((c.y - t.centre.y) / dtS) };
      if (t.displacementPx >= noise) t.directionDeg = angleDeg(t.centre, c);
    }

    // Unseen for longer than the grace period: continuity is broken, so movement history and timers start over.
    if (gapMs > cfg.missedGraceS * 1000 && t.missedFrames > 0) {
      t.moves = [];
      t.samples = [];
      t.anchor = c;
      t.lowSince = null;
      t.stillSince = null;
    }

    const anchorMove = dist(t.anchor, c);
    if (anchorMove > noise) {
      t.moves.push({ t: now, d: anchorMove });
      t.anchor = c;
    }
    t.samples.push({ t: now, x: c.x, y: c.y });
    if (t.samples.length > cfg.historyMaxSamples) t.samples.splice(0, t.samples.length - cfg.historyMaxSamples);

    // Rolling window: from the latest sample at or before (now - window); history is sufficient only if one exists.
    const windowStart = now - cfg.observationWindowS * 1000;
    let spanStart: number | null = null;
    for (const s of t.samples) if (s.t <= windowStart) spanStart = s.t;
    t.sufficientHistory = spanStart !== null;
    const from = spanStart ?? t.samples[0].t;
    const span = (now - from) / 1000;
    t.moves = t.moves.filter((m) => m.t > from); // also bounds memory
    t.speed = span > 0 ? t.moves.reduce((s, m) => s + m.d, 0) / span : 0;

    t.bbox = d.bbox;
    t.centre = c;
    t.detectionConfidence = d.confidence;
    t.trackingConfidence = 0.5 * t.trackingConfidence + 0.5 * Math.min(1, score * 2);
    t.lastSeenAt = now;
    t.hits += 1;
    t.matched = true;
    t.missedFrames = 0;
    if (!t.confirmed && t.hits >= cfg.minHitsToConfirm) t.confirmed = true;

    const timers = advanceTimers(t.speed, t.sufficientHistory, t.lowSince, t.stillSince, now, cfg);
    t.lowSince = timers.lowSince;
    t.stillSince = timers.stillSince;
    this.setBehaviour(t, now);
  }

  private setBehaviour(t: Internal, now: number) {
    const next = classifyBehaviour(
      { matched: t.matched, confirmed: t.confirmed, trackingConfidence: t.trackingConfidence, sufficientHistory: t.sufficientHistory, lowSince: t.lowSince, stillSince: t.stillSince },
      t.behaviour, t.stateSince, now, this.config,
    );
    if (next !== t.behaviour) {
      t.behaviour = next;
      t.stateSince = now;
    }
  }

  private reliable(t: Internal) {
    return t.matched && t.confirmed && t.trackingConfidence >= this.config.minTrackingConfidence;
  }

  /** Durations are measured to the last sighting so a vanished fish's timers do not keep growing. */
  private duration(since: number | null, t: Internal) {
    return since === null ? 0 : Math.max(0, (t.lastSeenAt - since) / 1000);
  }

  private snapshot(t: Internal, now: number): FishTrack {
    return {
      trackId: t.id,
      bbox: { ...t.bbox },
      centre: { ...t.centre },
      prevCentre: t.prevCentre ? { ...t.prevCentre } : null,
      detectionConfidence: t.detectionConfidence,
      confidence: t.detectionConfidence,
      trackingConfidence: t.trackingConfidence,
      displacementPx: t.displacementPx,
      elapsedSeconds: t.elapsedSeconds,
      speedPxPerSecond: t.speed,
      directionDeg: t.directionDeg,
      behaviour: t.behaviour,
      lowActivityDurationSeconds: this.duration(t.lowSince, t),
      inactiveDurationSeconds: this.duration(t.stillSince, t),
      timeInStateSeconds: Math.max(0, (now - t.stateSince) / 1000),
      timeSinceLastSeenSeconds: Math.max(0, (now - t.lastSeenAt) / 1000),
      visible: t.matched,
      confirmed: t.confirmed,
      trackingReliable: this.reliable(t),
      hits: t.hits,
      missedFrames: t.missedFrames,
      firstSeenAt: t.firstSeenAt,
      lastSeenAt: t.lastSeenAt,
      history: t.samples.map((s) => ({ ...s })),
    };
  }
}
