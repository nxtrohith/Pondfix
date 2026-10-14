// Time-range selection and trend maths for the charts and forecast screens. Pure, so it is unit-tested.
import type { Parameter, SeriesPoint } from '@/types';
import { t } from '@/i18n';

export const CHART_RANGES = [
  { key: '1H', label: '1H', minutes: 60 },
  { key: '6H', label: '6H', minutes: 6 * 60 },
  { key: '24H', label: '24H', minutes: 24 * 60 },
  { key: '7D', label: '7D', minutes: 7 * 24 * 60 },
] as const;
export type RangeKey = (typeof CHART_RANGES)[number]['key'];
export const rangeMinutes = (key: RangeKey) => CHART_RANGES.find((r) => r.key === key)!.minutes;

/** Points inside [asOf - range, asOf], thinned to at most `maxPoints` while keeping the first and last points. */
export function sliceSeries(series: SeriesPoint[], asOf: string, range: RangeKey, maxPoints = 120): SeriesPoint[] {
  const end = Date.parse(asOf);
  const start = end - rangeMinutes(range) * 60000;
  const inside = series.filter((p) => {
    const t = Date.parse(p.at);
    return t >= start && t <= end;
  });
  if (inside.length <= maxPoints) return inside;
  const step = (inside.length - 1) / (maxPoints - 1);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(inside[Math.round(i * step)]!);
  return out;
}

export type Trend = 'rising' | 'falling' | 'steady';

/** Direction from first to last value. Changes within a small tolerance are "steady" so noise is not reported as a trend. */
export function trendOf(points: { value: number }[]): Trend {
  if (points.length < 2) return 'steady';
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const tolerance = Math.max(0.05, Math.abs(first) * 0.02);
  const delta = last - first;
  if (Math.abs(delta) <= tolerance) return 'steady';
  return delta > 0 ? 'rising' : 'falling';
}

/** Lowest / highest value in a window, used for chart scaling and summaries. */
export function extent(points: { value: number }[]): { min: number; max: number } | null {
  if (points.length === 0) return null;
  let min = Infinity; let max = -Infinity;
  for (const p of points) { if (p.value < min) min = p.value; if (p.value > max) max = p.value; }
  return { min, max };
}

/** Plain-language outlook for model forecasts. Each value carries the backend's own risk verdict, so no limits are applied here. */
export function forecastOutlook(parameter: Parameter, values: { minutesAhead: number; risk: string; direction?: 'low' | 'high' }[]): { status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'; text: string } {
  const rank: Record<string, number> = { NORMAL: 0, WARNING: 1, CRITICAL: 2 };
  let worst: { minutesAhead: number; status: 'NORMAL' | 'WARNING' | 'CRITICAL'; direction?: 'low' | 'high' } | null = null;
  for (const v of values) {
    if (!(v.risk in rank)) continue;
    if (!worst || rank[v.risk]! > rank[worst.status]!) worst = { minutesAhead: v.minutesAhead, status: v.risk as 'NORMAL' | 'WARNING' | 'CRITICAL', direction: v.direction };
  }
  const name = t(`forecast.outlookName.${parameter}`);
  if (!worst) return { status: 'UNKNOWN', text: t('forecast.outlook.unknown', { name: t(`forecast.outlookNameLower.${parameter}`) }) };
  if (worst.status === 'NORMAL') return { status: 'NORMAL', text: t('forecast.outlook.normal', { name }) };
  const when = worst.minutesAhead < 60 ? t('forecast.outlook.minutes', { count: worst.minutesAhead }) : t('forecast.outlook.hours', { count: worst.minutesAhead / 60 });
  const side = worst.direction === 'low' ? t('forecast.outlook.low') : t('forecast.outlook.high');
  const text = worst.status === 'CRITICAL'
    ? t('forecast.outlook.critical', { name, side, when })
    : t('forecast.outlook.warning', { name, side, when });
  return { status: worst.status, text };
}
