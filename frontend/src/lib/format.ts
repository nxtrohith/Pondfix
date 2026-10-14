import { DISPLAY_TIMEZONE } from './env';
import type { DataSource, Parameter } from './api/schemas';

export const PARAM_LABEL: Record<string, string> = {
  dissolved_oxygen: 'Dissolved oxygen',
  ph: 'pH',
  temperature: 'Temperature',
  water_level: 'Water level',
};
export const PARAM_SHORT: Record<string, string> = { dissolved_oxygen: 'Oxygen', ph: 'pH', temperature: 'Temp', water_level: 'Level' };

export function unitLabel(unit?: string | null): string {
  if (!unit) return '';
  if (unit === 'C') return '°C';
  if (unit === 'pH') return '';
  return unit;
}

const DECIMALS: Record<string, number> = { dissolved_oxygen: 2, ph: 2, temperature: 1, water_level: 2 };
export function formatValue(value: number | null | undefined, parameter: string, withUnit = false, unit?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const text = value.toFixed(DECIMALS[parameter] ?? 2);
  const u = unitLabel(unit);
  return withUnit && u ? `${text} ${u}` : text;
}

function parts(date: Date, opts: Intl.DateTimeFormatOptions, tz = DISPLAY_TIMEZONE) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(date);
}
/** "UTC" or an unambiguous offset such as "GMT+5:30" (city names differ between browsers: Kolkata vs Calcutta). */
const tzLabel = (tz: string, d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? tz;

export function formatDateTime(iso: string | null | undefined, tz = DISPLAY_TIMEZONE): string {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return 'n/a';
  return `${parts(d, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, tz)} ${tzLabel(tz, d)}`;
}
export function formatDate(iso: string | null | undefined, tz = DISPLAY_TIMEZONE): string {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  return Number.isNaN(+d) ? 'n/a' : parts(d, { day: '2-digit', month: 'short', year: 'numeric' }, tz);
}
/** Axis labels that stay unambiguous: time only for short spans, day + time for a few days, date for longer spans. */
export function formatAxisTime(ms: number, spanMs: number, tz = DISPLAY_TIMEZONE): string {
  const d = new Date(ms);
  if (spanMs <= 30 * 3600_000) return parts(d, { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
  if (spanMs <= 9 * 86400_000) return parts(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, tz).replace(',', '');
  return parts(d, { day: '2-digit', month: 'short' }, tz);
}

/** "12 min", "5 h", "8 months" from a number of minutes. */
export function formatAge(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return 'n/a';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 60) return `${Math.round(minutes / 1440)} days ago`;
  return `${Math.round(minutes / 43200)} months ago`;
}

export const SOURCE_LABEL: Record<DataSource, string> = { historical: 'Historical data', simulated: 'Test data', live: 'Live data' };
export const horizonLabel = (minutes?: number) => (minutes === undefined ? 'n/a' : minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`);

export const isParameter = (p: string): p is Parameter => p in PARAM_LABEL;

/** Canonical display unit per parameter (alerts store the threshold but not the unit). */
export const DEFAULT_UNIT: Record<string, string> = { dissolved_oxygen: 'mg/L', ph: '', temperature: '°C', water_level: 'm' };

/** Thresholds come from the API as plain numbers (2, 3); show them with one decimal like the rules are written (2.0, 3.0). */
export const fmtThreshold = (n: number) => n.toFixed(1);
