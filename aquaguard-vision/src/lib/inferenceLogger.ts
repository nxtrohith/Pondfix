/**
 * inferenceLogger.ts — Structured development logging for fish observations and behaviour changes.
 *
 * Behaviour transitions are logged the moment they happen. Everything else is a periodic summary (every
 * `summaryIntervalMs`), so the terminal is not flooded with one block per frame. Every value logged is the computed value.
 */

import type { BehaviourTransition, FishTrack } from './fishTracker.ts';
import type { FishStats } from './fishStats.ts';

export interface LogSettings {
  /** How often the per-track summary is printed. 0 disables the periodic summary. */
  summaryIntervalMs: number;
  /** Print one compact line for every processed frame (noisy; for debugging only). */
  everyFrame: boolean;
}

export const DEFAULT_LOG_SETTINGS: LogSettings = { summaryIntervalMs: 3_000, everyFrame: true };

export interface FrameLog {
  timestamp: number;
  frameId: number;
  stats: FishStats;
  tracks: FishTrack[];
  transitions: BehaviourTransition[];
  /** Server-reported model time. */
  inferenceMs: number;
  /** Capture-to-tracker-update time for the whole frame (camera + network + inference + tracking). */
  frameProcessingMs: number;
  error?: string;
}

const f = (n: number, d = 1) => n.toFixed(d);
const iso = (ms: number) => new Date(ms).toISOString();

export function countsLine(s: FishStats) {
  return `visibleDetections=${s.visibleDetections} reliablyTrackedVisible=${s.reliablyTrackedVisible} ACTIVE=${s.active} LOW_ACTIVITY=${s.lowActivity} POSSIBLY_MOTIONLESS=${s.possiblyMotionless} TRACKING_UNCERTAIN=${s.trackingUncertain} UNKNOWN=${s.unknown} totalTracked=${s.totalTracked}`;
}

function trackLine(t: FishTrack) {
  const b = t.bbox;
  return (
    `  ${t.trackId} state=${t.behaviour} tracking=${t.trackingReliable ? 'reliable' : t.visible ? 'unreliable' : 'lost'}` +
    ` detConf=${f(t.detectionConfidence, 2)} trackConf=${f(t.trackingConfidence, 2)}` +
    ` bbox=[${f(b.x1, 0)},${f(b.y1, 0)},${f(b.x2, 0)},${f(b.y2, 0)}] centre=(${f(t.centre.x)},${f(t.centre.y)})` +
    ` displacementPx=${f(t.displacementPx, 2)} elapsedS=${f(t.elapsedSeconds, 2)} speedPxPerS=${f(t.speedPxPerSecond, 2)}` +
    ` lowActivityS=${f(t.lowActivityDurationSeconds)} inactiveS=${f(t.inactiveDurationSeconds)} inStateS=${f(t.timeInStateSeconds)}` +
    ` lastSeenAgoS=${f(t.timeSinceLastSeenSeconds)}`
  );
}

export function createLogger(settings: LogSettings = DEFAULT_LOG_SETTINGS) {
  let lastSummaryAt = 0;
  return function log(l: FrameLog) {
    const latency = `inferenceMs=${f(l.inferenceMs)} frameProcessingMs=${f(l.frameProcessingMs)}`;
    for (const tr of l.transitions) {
      const t = l.tracks.find((x) => x.trackId === tr.trackId);
      console.log(
        `[FISH_TRANSITION] ${iso(tr.at)} ${tr.trackId} ${tr.from} -> ${tr.to}` +
          ` speedPxPerS=${f(tr.speedPxPerSecond, 2)} lowActivityS=${f(tr.lowActivityDurationSeconds)} inactiveS=${f(tr.inactiveDurationSeconds)}` +
          ` trackingReliable=${tr.trackingReliable}` + (t ? ` detConf=${f(t.detectionConfidence, 2)} centre=(${f(t.centre.x)},${f(t.centre.y)}) displacementPx=${f(t.displacementPx, 2)} elapsedS=${f(t.elapsedSeconds, 2)}` : '') +
          `\n  ${countsLine(l.stats)} ${latency}`,
      );
    }
    if (l.error) console.warn(`[AQUAGUARD_ERROR] ${iso(l.timestamp)} frame=${l.frameId} ${l.error}`);
    if (settings.everyFrame) console.log(`[AQUAGUARD_FRAME] ${iso(l.timestamp)} frame=${l.frameId} ${countsLine(l.stats)} ${latency}`);
    if (settings.summaryIntervalMs > 0 && l.timestamp - lastSummaryAt >= settings.summaryIntervalMs) {
      lastSummaryAt = l.timestamp;
      console.log(
        `[AQUAGUARD_SUMMARY] ${iso(l.timestamp)} frame=${l.frameId} ${countsLine(l.stats)} ${latency}` +
          (l.tracks.length ? `\n${l.tracks.map(trackLine).join('\n')}` : '\n  (no tracks)'),
      );
    }
  };
}
