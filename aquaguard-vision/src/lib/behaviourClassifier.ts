/**
 * behaviourClassifier.ts — Pure, deterministic behaviour state machine for one track.
 *
 * The classifier never looks at a single frame. It reads two sustained-duration timers that the tracker maintains from
 * the smoothed speed (lowSince: speed below the low-activity threshold, stillSince: speed below the motionless threshold),
 * each with its own exit threshold (hysteresis), so a state is entered only after the condition has held for the
 * required time and left only when the speed clearly recovers.
 *
 * Evaluation order is fixed, first match wins, so a fish is in exactly one state:
 *   1. not matched in the latest frame      -> TRACKING_UNCERTAIN  (a vanished fish is never "motionless")
 *   2. track not yet confirmed              -> UNKNOWN
 *   3. association quality too low          -> TRACKING_UNCERTAIN
 *   4. history does not cover the window    -> UNKNOWN
 *   5. still >= motionlessMinS              -> POSSIBLY_MOTIONLESS
 *   6. low   >= lowActivityMinS             -> LOW_ACTIVITY
 *   7. otherwise                            -> ACTIVE
 * POSSIBLY_MOTIONLESS means "very little visible movement", not that the fish is dead or unwell.
 */

import type { BehaviourConfig } from './behaviourConfig.ts';

export type BehaviourState =
  | 'UNKNOWN'
  | 'ACTIVE'
  | 'LOW_ACTIVITY'
  | 'POSSIBLY_MOTIONLESS'
  | 'TRACKING_UNCERTAIN';

export interface ClassifierInput {
  /** Matched to a detection in the latest processed frame. */
  matched: boolean;
  confirmed: boolean;
  trackingConfidence: number;
  /** Observation history covers at least the observation window. */
  sufficientHistory: boolean;
  /** Timestamp (ms) since which smoothed speed has stayed under the low-activity threshold, or null. */
  lowSince: number | null;
  /** Timestamp (ms) since which smoothed speed has stayed under the motionless threshold, or null. */
  stillSince: number | null;
}

const CLASSIFIED: ReadonlySet<BehaviourState> = new Set(['ACTIVE', 'LOW_ACTIVITY', 'POSSIBLY_MOTIONLESS']);

export const isClassified = (s: BehaviourState) => CLASSIFIED.has(s);

export function classifyBehaviour(
  input: ClassifierInput,
  current: BehaviourState,
  stateSinceMs: number,
  nowMs: number,
  cfg: BehaviourConfig,
): BehaviourState {
  if (!input.matched) return 'TRACKING_UNCERTAIN';
  if (!input.confirmed) return 'UNKNOWN';
  if (input.trackingConfidence < cfg.minTrackingConfidence) return 'TRACKING_UNCERTAIN';
  if (!input.sufficientHistory) return 'UNKNOWN';

  let desired: BehaviourState = 'ACTIVE';
  if (input.stillSince !== null && nowMs - input.stillSince >= cfg.motionlessMinS * 1000) desired = 'POSSIBLY_MOTIONLESS';
  else if (input.lowSince !== null && nowMs - input.lowSince >= cfg.lowActivityMinS * 1000) desired = 'LOW_ACTIVITY';

  // Minimum dwell time only between behaviour classes; becoming/ceasing to be uncertain or unknown is never delayed.
  if (isClassified(current) && desired !== current && nowMs - stateSinceMs < cfg.minStateDurationS * 1000) return current;
  return desired;
}

/**
 * Advances the two sustained-duration timers from the latest smoothed speed. Entry and exit thresholds differ:
 * between them the timer is left as it was, which is what stops a fish hovering around a threshold from flickering.
 * Timers only start once the history covers the observation window (before that the speed is not trustworthy).
 */
export function advanceTimers(
  speed: number,
  sufficientHistory: boolean,
  lowSince: number | null,
  stillSince: number | null,
  nowMs: number,
  cfg: BehaviourConfig,
): { lowSince: number | null; stillSince: number | null } {
  let low = lowSince;
  let still = stillSince;
  if (speed >= cfg.lowActivityExitSpeed) low = null;
  else if (sufficientHistory && speed < cfg.lowActivitySpeed && low === null) low = nowMs;
  if (speed >= cfg.motionlessExitSpeed) still = null;
  else if (sufficientHistory && speed < cfg.motionlessSpeed && still === null) still = nowMs;
  return { lowSince: low, stillSince: still };
}
