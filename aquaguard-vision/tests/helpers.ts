import { FishTracker, type BBox, type Detection, type TrackerUpdate } from '../src/lib/fishTracker.ts';
import type { BehaviourConfig } from '../src/lib/behaviourConfig.ts';

export const box = (cx: number, cy: number, w = 60, h = 30): BBox => ({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
export const det = (cx: number, cy: number, confidence = 0.8): Detection => ({ bbox: box(cx, cy), confidence, label: 'fish' });

/** Drives a tracker with deterministic synthetic frames. Times are in seconds from 0. */
export class Rig {
  tracker: FishTracker;
  last!: TrackerUpdate;
  constructor(cfg: Partial<BehaviourConfig> = {}) { this.tracker = new FishTracker(cfg); }
  frame(tSeconds: number, detections: Detection[]) { this.last = this.tracker.update(detections, tSeconds * 1000); return this.last; }
  /** One fish following position(t), sampled at the given times. */
  run(times: number[], position: (t: number) => [number, number]) {
    for (const t of times) { const [x, y] = position(t); this.frame(t, [det(x, y)]); }
    return this.last;
  }
  get only() { return this.last.tracks[0]; }
}

export const range = (from: number, to: number, step = 1) => { const out: number[] = []; for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000); return out; };
