// Inputs for the "What if" playground. Mirrors the backend's bounds so a typo is caught before a request; the server stays the authority.
export type Trend = 'falling' | 'steady' | 'rising';
export interface WhatIfInput {
  temperature: string; temperatureTrend: Trend;
  dissolvedOxygen: string; dissolvedOxygenTrend: Trend;
  ph: string; phTrend: Trend;
  ammonia: string; nitrite: string; alkalinity: string;
  hourIst: number;
}
export type WhatIfField = 'temperature' | 'dissolvedOxygen' | 'ph' | 'ammonia' | 'nitrite' | 'alkalinity' | 'form';
export type WhatIfErrors = Partial<Record<WhatIfField, string>>;

export const WHATIF_BOUNDS: Record<Exclude<WhatIfField, 'form'>, [number, number]> = {
  temperature: [-5, 60], dissolvedOxygen: [0, 50], ph: [0, 14], ammonia: [0, 20], nitrite: [0, 20], alkalinity: [0, 500],
};
export const WHATIF_LABEL: Record<Exclude<WhatIfField, 'form'>, string> = {
  temperature: 'Water temperature', dissolvedOxygen: 'Dissolved oxygen', ph: 'pH', ammonia: 'Total ammonia', nitrite: 'Nitrite', alkalinity: 'Alkalinity',
};
export const WHATIF_UNIT: Record<Exclude<WhatIfField, 'form'>, string> = { temperature: '°C', dissolvedOxygen: 'mg/L', ph: '', ammonia: 'mg/L', nitrite: 'mg/L', alkalinity: 'mg/L' };
/** Time of day, as the hour on the IST clock the rules use. */
export const TIMES_OF_DAY = [{ value: '9', label: 'Morning' }, { value: '15', label: 'Afternoon' }, { value: '21', label: 'Evening' }, { value: '4', label: 'Before dawn' }] as const;

export const emptyWhatIf = (): WhatIfInput => ({
  temperature: '28', temperatureTrend: 'steady', dissolvedOxygen: '6', dissolvedOxygenTrend: 'steady', ph: '7.8', phTrend: 'steady', ammonia: '', nitrite: '', alkalinity: '', hourIst: 15,
});

/** Example situations to try. Illustrations, not measurements. */
export const WHATIF_PRESETS: { id: string; label: string; hint: string; input: WhatIfInput }[] = [
  { id: 'hot-afternoon', label: 'Hot afternoon', hint: 'Water warming fast, pH climbing', input: { ...emptyWhatIf(), temperature: '31.5', temperatureTrend: 'rising', dissolvedOxygen: '5.8', ph: '8.6', hourIst: 15 } },
  { id: 'cloudy-night', label: 'Cloudy night', hint: 'Oxygen sliding after dark', input: { ...emptyWhatIf(), temperature: '27', dissolvedOxygen: '4.2', dissolvedOxygenTrend: 'falling', ph: '7.4', hourIst: 21 } },
  { id: 'algae-bloom', label: 'Algae bloom', hint: 'Oxygen far above normal in the afternoon', input: { ...emptyWhatIf(), temperature: '30', dissolvedOxygen: '10.5', ph: '8.8', hourIst: 15 } },
  { id: 'after-rain', label: 'After heavy rain', hint: 'Diluted, poorly buffered water', input: { ...emptyWhatIf(), temperature: '26', dissolvedOxygen: '4.5', ph: '7.2', alkalinity: '35', nitrite: '0.3', hourIst: 9 } },
];

const NUMERIC = /^-?\d+(\.\d+)?$/;
/** Request body for POST /what-if, or field errors. A blank field is simply left out. */
export function buildWhatIfRequest(i: WhatIfInput): { ok: true; body: Record<string, unknown> } | { ok: false; errors: WhatIfErrors } {
  const errors: WhatIfErrors = {}; const body: Record<string, unknown> = { hourIst: i.hourIst };
  for (const f of Object.keys(WHATIF_BOUNDS) as (keyof typeof WHATIF_BOUNDS)[]) {
    const raw = i[f].trim();
    if (raw === '') continue;
    const [lo, hi] = WHATIF_BOUNDS[f];
    const n = Number(raw);
    if (!NUMERIC.test(raw) || !Number.isFinite(n)) errors[f] = 'Enter a number.';
    else if (n < lo || n > hi) errors[f] = `Must be between ${lo} and ${hi}${WHATIF_UNIT[f] ? ` ${WHATIF_UNIT[f]}` : ''}.`;
    else {
      body[f] = n;
      if (f === 'temperature' || f === 'dissolvedOxygen' || f === 'ph') body[`${f}Trend`] = i[`${f}Trend`];
    }
  }
  if (!Object.keys(errors).length && !['temperature', 'dissolvedOxygen', 'ph'].some((f) => f in body)) errors.form = 'Enter at least one of temperature, oxygen or pH.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, body };
}
