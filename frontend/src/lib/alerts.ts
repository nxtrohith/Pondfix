// Presentation helpers for alerts. Wording about limits comes from the backend's alert message; nothing here repeats a threshold.
import { Drop, Flask, Thermometer } from '@phosphor-icons/react/dist/ssr';
import type { Alert, Rule } from './api/schemas';
import { DEFAULT_UNIT, PARAM_LABEL, formatValue, horizonLabel, unitLabel } from './format';

export const ALERT_PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
export const PARAM_ICON: Record<string, typeof Drop> = { dissolved_oxygen: Drop, ph: Flask, temperature: Thermometer };

export const directionLabel = (d?: 'low' | 'high') => (d === 'low' ? 'Low' : d === 'high' ? 'High' : '');

/** Short title: "High pH", "Low water temperature", "Low dissolved oxygen". */
export function alertTitle(a: Pick<Alert, 'parameter' | 'direction'>): string {
  const label = (PARAM_LABEL[a.parameter] ?? a.parameter);
  const name = a.parameter === 'ph' ? label : label.toLowerCase();
  return a.direction ? `${directionLabel(a.direction)} ${name}` : label;
}

/** "6.5 to 8.5 pH", "20 to 32 °C", "at least 3 mg/L". */
export function acceptableText(r: Rule): string {
  const u = unitLabel(r.unit); const sfx = u ? ` ${u}` : '';
  const { min, max } = r.acceptableRange;
  if (min !== null && max !== null) return `${min} to ${max}${sfx}`;
  if (min !== null) return `${min}${sfx} or above`;
  if (max !== null) return `${max}${sfx} or below`;
  return 'n/a';
}
