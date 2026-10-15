// Presentation helpers for alerts. Wording about limits comes from the backend's alert message; nothing here repeats a threshold.
import { Drop, Flask, Thermometer, Waves } from '@phosphor-icons/react/dist/ssr';
import type { Alert, Rule } from './api/schemas';
import { DEFAULT_UNIT, PARAM_LABEL, formatValue, horizonLabel, unitLabel } from './format';

export const ALERT_PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
/** Measured and shown, but with no alert limits (see the backend risk rules): they never raise or clear an alert. */
export const CHEMISTRY_PARAMETERS = ['ammonia', 'un_ionized_ammonia', 'nitrite', 'nitrate', 'alkalinity', 'salinity', 'turbidity'] as const;
/** Values the backend calculates from other readings (not a sensor): shown as "Calculated". */
export const DERIVED_PARAMETERS: readonly string[] = ['un_ionized_ammonia'];
/** One line on why each chemistry value matters, shown under its name. */
export const CHEMISTRY_HINT: Record<string, string> = {
  ammonia: 'Waste from feed and stock. Harmful when high.',
  un_ionized_ammonia: 'The toxic part of ammonia. Rises with pH and warmth.',
  nitrite: 'Builds up when oxygen is low. Harmful to stock.',
  nitrate: 'End product of the cycle. Builds up slowly.',
  alkalinity: 'Holds pH steady. Low alkalinity means bigger pH swings.',
  salinity: 'Falls with rain, rises as water evaporates.',
  turbidity: 'Cloudiness from algae, silt or rain.',
};
export const PARAM_ICON: Record<string, typeof Drop> = { dissolved_oxygen: Drop, ph: Flask, temperature: Thermometer, water_level: Waves, ammonia: Flask, nitrate: Flask, turbidity: Drop, un_ionized_ammonia: Flask, nitrite: Flask, alkalinity: Flask, salinity: Drop };

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
