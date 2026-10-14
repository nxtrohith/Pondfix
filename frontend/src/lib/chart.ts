export interface Point { t: number; v: number | null }

/**
 * Insert null breaks wherever consecutive observations are further apart than `gapMs`, so a chart line never bridges
 * missing data (which would present interpolation as if it were observed).
 */
export function breakGaps(points: { t: number; v: number }[], gapMs: number): Point[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: Point[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev && p.t - prev.t > gapMs) out.push({ t: prev.t + 1, v: null });
    out.push({ t: p.t, v: p.v });
  });
  return out;
}

/** Gap threshold: 3x the median spacing (min 20 min), robust to sensors with different cadences. */
export function gapThreshold(times: number[]): number {
  const t = [...times].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < t.length; i++) diffs.push(t[i]! - t[i - 1]!);
  if (!diffs.length) return 45 * 60_000;
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)]!;
  return Math.max(3 * median, 20 * 60_000);
}

export function summarize(points: { t: number; v: number }[]) {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const values = sorted.map((p) => p.v);
  return { count: sorted.length, min: Math.min(...values), max: Math.max(...values), first: sorted[0]!, last: sorted[sorted.length - 1]! };
}

/**
 * Split measurements into recorded data (historical or live) and simulated test readings so charts never draw a
 * simulated value as part of the recorded line.
 */
export function splitBySource(items: { recordedAt: string; source: string; values: { parameter: string; value: number; unit: string }[] }[], parameter: string) {
  const recorded: { t: number; v: number }[] = [];
  const simulated: { t: number; v: number }[] = [];
  let unit: string | undefined;
  for (const m of items) {
    const val = m.values.find((v) => v.parameter === parameter);
    if (!val) continue;
    unit = val.unit;
    (m.source === 'simulated' ? simulated : recorded).push({ t: Date.parse(m.recordedAt), v: val.value });
  }
  return { recorded, simulated, unit };
}

/**
 * Time-axis domain for a chart. A single point in time (or none) would give a zero-width axis, which makes the chart
 * library emit duplicate ticks and draw no line, so it is widened symmetrically around the point.
 */
export function chartDomain(times: number[], override?: [number, number], padMs = 30 * 60_000): [number, number] {
  if (override) return override[0] === override[1] ? [override[0] - padMs, override[1] + padMs] : override;
  if (!times.length) return [0, 1];
  const lo = Math.min(...times); const hi = Math.max(...times);
  return lo === hi ? [lo - padMs, hi + padMs] : [lo, hi];
}

/** `count` evenly spaced, strictly increasing tick times from start to end (inclusive). Never returns duplicates. */
export function axisTicks(start: number, end: number, count = 5): number[] {
  if (!(end > start) || count < 2) return [Math.round(start)];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round(start + ((end - start) * i) / (count - 1));
    if (out.length === 0 || t > out[out.length - 1]!) out.push(t);
  }
  return out;
}

export const RANGE_MS = { '24h': 24 * 3600_000, '3d': 3 * 86400_000, '7d': 7 * 86400_000 } as const;
export type RangeKey = keyof typeof RANGE_MS;
