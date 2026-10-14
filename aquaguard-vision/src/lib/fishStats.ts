/**
 * fishStats.ts — Live fish statistics derived purely from the latest track snapshots.
 *
 * Nothing is stored or incremented: every number is recomputed from the tracks passed in, and each track is counted in
 * exactly one behaviour category, so the counters cannot drift out of step with the underlying states.
 *
 * Invariants (asserted by the unit tests):
 *   active + lowActivity + possiblyMotionless === reliablyTrackedVisible
 *   active + lowActivity + possiblyMotionless + trackingUncertain + unknown === totalTracked
 * A track is only ever ACTIVE / LOW_ACTIVITY / POSSIBLY_MOTIONLESS while it is matched in the latest frame, so a fish that
 * has disappeared is never counted as a visible motionless fish.
 */

import type { FishTrack } from './fishTracker.ts';

export interface FishStats {
  /** Detections in the latest processed frame (after the confidence filter). May include false positives and unconfirmed fish. */
  visibleDetections: number;
  /** Confirmed, currently matched fish with a classified behaviour. */
  reliablyTrackedVisible: number;
  active: number;
  lowActivity: number;
  possiblyMotionless: number;
  trackingUncertain: number;
  unknown: number;
  /** Every live track (visible or temporarily lost, confirmed or not) — distinct from currently visible fish. */
  totalTracked: number;
}

export const EMPTY_STATS: FishStats = {
  visibleDetections: 0, reliablyTrackedVisible: 0, active: 0, lowActivity: 0, possiblyMotionless: 0,
  trackingUncertain: 0, unknown: 0, totalTracked: 0,
};

export function computeStats(tracks: readonly FishTrack[], visibleDetections: number): FishStats {
  const s: FishStats = { ...EMPTY_STATS, visibleDetections, totalTracked: tracks.length };
  for (const t of tracks) {
    switch (t.behaviour) {
      case 'ACTIVE': s.active += 1; break;
      case 'LOW_ACTIVITY': s.lowActivity += 1; break;
      case 'POSSIBLY_MOTIONLESS': s.possiblyMotionless += 1; break;
      case 'TRACKING_UNCERTAIN': s.trackingUncertain += 1; break;
      default: s.unknown += 1;
    }
  }
  s.reliablyTrackedVisible = s.active + s.lowActivity + s.possiblyMotionless;
  return s;
}
