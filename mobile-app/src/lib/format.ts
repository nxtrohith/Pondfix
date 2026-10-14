// Presentation helpers. Numbers are shown with fixed decimals so a reading never looks more precise than the sensor.
import type { Parameter } from '@/types';

const DECIMALS: Record<Parameter, number> = { dissolved_oxygen: 1, ph: 1, temperature: 1 };

/** "2.6", or an explicit "No value" when the reading is missing (never a made-up number). */
export function formatValue(value: number | null | undefined, parameter: Parameter): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No value';
  return value.toFixed(DECIMALS[parameter]);
}

/** Clock time in UTC, e.g. "10:10 UTC". Demo timestamps are UTC so every screen reads the same. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'No reading yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown time';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/** "Jan 30, 10:10 UTC" style date and time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown time';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${formatTime(iso)}`;
}

/** "12 min ago", "2 h 5 min ago" relative to the demo clock. */
export function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
