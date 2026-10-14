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

export const RANGE_MS = { '24h': 24 * 3600_000, '3d': 3 * 86400_000, '7d': 7 * 86400_000 } as const;
export type RangeKey = keyof typeof RANGE_MS;
