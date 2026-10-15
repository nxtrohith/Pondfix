// Presentation helpers. Numbers are shown with fixed decimals so a reading never looks more precise than the sensor.
// Digits are always 0-9 (never native-script numerals) so a value reads the same in every language and matches what the sensors and alerts
// say. Words and date order follow the active language; timestamps stay in UTC so every screen reads the same.
import type { ChemistryParameter, Parameter } from '@/types';
import { currentLanguage, t } from '@/i18n';
import { languageInfo } from '@/i18n/languages';

const DECIMALS: Record<Parameter | ChemistryParameter, number> = { dissolved_oxygen: 1, ph: 1, temperature: 1, ammonia: 2, un_ionized_ammonia: 3, nitrite: 2, nitrate: 1, alkalinity: 0, salinity: 1, turbidity: 1 };

/** Intl locale for the active language, with Latin digits forced. English keeps US ordering ("Jan 30") so existing screens read as before. */
export function formatLocale(): string {
  const code = currentLanguage();
  return `${code === 'en' ? 'en-US' : languageInfo(code).bcp47}-u-nu-latn`;
}

/** A number with exactly `decimals` places and the active language's separators. Falls back to toFixed when Intl is unavailable. */
export function formatNumber(value: number, decimals: number): string {
  try { return new Intl.NumberFormat(formatLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value); } catch { return value.toFixed(decimals); }
}

/** "2.6", or an explicit "No value" when the reading is missing (never a made-up number). */
export function formatValue(value: number | null | undefined, parameter: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return t('format.noValue');
  return formatNumber(value, DECIMALS[parameter as Parameter | ChemistryParameter] ?? 1);
}

/** Clock time in UTC, e.g. "10:10 UTC". Demo timestamps are UTC so every screen reads the same. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return t('format.noReadingYet');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('format.unknownTime');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jan 30, 10:10 UTC" style date and time, with the month name and order of the active language. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return t('format.notRecorded');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('format.unknownTime');
  let day: string;
  try { day = new Intl.DateTimeFormat(formatLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d); } catch { day = `${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}`; }
  return `${day}, ${formatTime(iso)}`;
}

/** "12 min ago", "2 h 5 min ago" relative to the demo clock. */
export function formatAge(minutes: number): string {
  if (minutes < 1) return t('format.justNow');
  if (minutes < 60) return t('format.minutesAgo', { count: Math.round(minutes) });
  if (minutes >= 48 * 60) return t('format.daysAgo', { count: Math.round(minutes / 1440) });
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? t('format.hoursAgo', { count: h }) : t('format.hoursMinutesAgo', { hours: h, minutes: m });
}
