/**
 * behaviourConfig.ts — Every tunable number for tracking and behaviour classification, in one place.
 *
 * All distances are in "reference pixels": detections are rescaled to a fixed reference width (see
 * REFERENCE_FRAME_WIDTH) before they reach the tracker, so the numbers mean the same thing whatever
 * resolution the phone camera delivers. They are image-plane pixels, NOT physical distances: no camera
 * calibration exists, so nothing here is a swimming speed in cm/s.
 *
 * Tuning (see README "Tuning the thresholds"):
 *  - Camera further away / lower zoom  -> fish look smaller and move fewer pixels: lower the speed thresholds.
 *  - Larger fish in frame               -> raise them. `noiseFloorBoxFraction` already scales jitter with box size.
 *  - Capture interval (frame rate)      -> the speeds are time-based, but the observation window needs >= 3
 *    samples to be meaningful: with 1.5 s between frames, 5 s is about 3 samples.
 *  - Detector jitter high               -> raise `noiseFloorPx` / `noiseFloorBoxFraction`, not the speed thresholds.
 */

export const REFERENCE_FRAME_WIDTH = 640;

export interface BehaviourConfig {
  /** Rolling window (s) over which movement is smoothed. */
  observationWindowS: number;
  /** Enter LOW_ACTIVITY when smoothed speed is below this (px/s)... */
  lowActivitySpeed: number;
  /** ...and only leave it once smoothed speed reaches this (hysteresis, >= lowActivitySpeed). */
  lowActivityExitSpeed: number;
  /** Enter POSSIBLY_MOTIONLESS when smoothed speed is below this (px/s)... */
  motionlessSpeed: number;
  /** ...and only leave it once smoothed speed reaches this (hysteresis, >= motionlessSpeed). */
  motionlessExitSpeed: number;
  /** Speed must stay under lowActivitySpeed this long (s) before LOW_ACTIVITY. */
  lowActivityMinS: number;
  /** Speed must stay under motionlessSpeed this long (s) before POSSIBLY_MOTIONLESS. */
  motionlessMinS: number;
  /**
   * A track that is not matched in the current frame is shown as TRACKING_UNCERTAIN. If it is found again within this
   * many seconds of its last sighting, its inactivity timers carry on; if it was gone longer, the timers (and the movement
   * history) restart, because continuity can no longer be claimed. NOTE: this is wall-clock time between sightings, so with
   * a 1.5 s capture interval one missed frame is a 3 s gap; raise it (e.g. 4) to bridge single missed detections.
   */
  missedGraceS: number;
  /** A track unseen for longer than this (s) is deleted. */
  trackExpireS: number;
  /** A behaviour state (ACTIVE / LOW_ACTIVITY / POSSIBLY_MOTIONLESS) is held at least this long (s) before changing. */
  minStateDurationS: number;

  /** Centroid moves smaller than max(noiseFloorPx, noiseFloorBoxFraction * box diagonal) are treated as detector jitter. */
  noiseFloorPx: number;
  noiseFloorBoxFraction: number;

  /** Observations (matched frames) before a new track is confirmed and counted as a real fish. */
  minHitsToConfirm: number;
  /** Association gate: max(minGatePx, gateDiagonalFactor * box diagonal) around the predicted centroid. */
  minGatePx: number;
  gateDiagonalFactor: number;
  /** Tracks whose smoothed association quality (0..1) drops below this are TRACKING_UNCERTAIN. */
  minTrackingConfidence: number;
  /** Detections below this confidence are ignored. */
  minDetectionConfidence: number;
  /** Samples kept per track (bounds memory). */
  historyMaxSamples: number;
}

export const DEFAULT_BEHAVIOUR_CONFIG: BehaviourConfig = {
  observationWindowS: 5,
  lowActivitySpeed: 5,
  lowActivityExitSpeed: 7,
  motionlessSpeed: 1,
  motionlessExitSpeed: 2,
  lowActivityMinS: 5,
  motionlessMinS: 15,
  missedGraceS: 1,
  trackExpireS: 10,
  minStateDurationS: 2,

  noiseFloorPx: 2,
  noiseFloorBoxFraction: 0.02,

  minHitsToConfirm: 3,
  minGatePx: 40,
  gateDiagonalFactor: 1.0,
  minTrackingConfidence: 0.25,
  minDetectionConfidence: 0.25,
  historyMaxSamples: 64,
};

export function resolveConfig(overrides: Partial<BehaviourConfig> = {}): BehaviourConfig {
  const c = { ...DEFAULT_BEHAVIOUR_CONFIG, ...overrides };
  // Exit thresholds below entry thresholds would make states flip-flop; clamp rather than silently misbehave.
  c.lowActivityExitSpeed = Math.max(c.lowActivityExitSpeed, c.lowActivitySpeed);
  c.motionlessExitSpeed = Math.max(c.motionlessExitSpeed, c.motionlessSpeed);
  return c;
}
