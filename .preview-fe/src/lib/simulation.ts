export type Scenario = 'healthy' | 'warning' | 'critical';
export type SimParam = 'dissolved_oxygen' | 'ph' | 'temperature';
export const SIM_PARAMS: SimParam[] = ['dissolved_oxygen', 'ph', 'temperature'];

/** Physically possible ranges, mirroring the backend validator. The server stays the authority; this only avoids a round trip. */
export const SIM_BOUNDS: Record<SimParam, [number, number]> = { dissolved_oxygen: [0, 50], ph: [0, 14], temperature: [-5, 60] };
export const SIM_LABEL: Record<SimParam, string> = { dissolved_oxygen: 'Dissolved oxygen', ph: 'pH', temperature: 'Water temperature' };
export const SIM_UNIT: Record<SimParam, string> = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: '°C' };
/** Example values for quick tests: illustrations, not measurements. The backend decides how each one is classified; the spread covers low and high excursions of the provisional demo limits. */
export const SIM_PRESETS: Record<'ph' | 'temperature', number[]> = { ph: [5.5, 6.2, 6.5, 7.4, 8.5, 8.8, 9.4], temperature: [12, 18, 24, 28, 32, 34, 37] };

export interface ParamInput {
  include: boolean;
  /** dissolved_oxygen: 'healthy' | 'warning' | 'critical' | 'custom'. pH and temperature: a preset value as text, or 'custom'. */
  choice: string;
  custom: string;
}
export interface SimInput {
  pondId: string;
  useNow: boolean;
  recordedAtInput: string;
  dissolved_oxygen: ParamInput;
  ph: ParamInput;
  temperature: ParamInput;
}
export type SimRequest = { pondId: string; scenario?: Scenario; dissolvedOxygen?: number; ph?: number; temperature?: number; recordedAt?: string };
export type SimErrors = Partial<Record<SimParam | 'pond' | 'recordedAt' | 'include', string>>;

export const defaultSimInput = (pondId = ''): SimInput => ({
  pondId, useNow: true, recordedAtInput: '',
  dissolved_oxygen: { include: true, choice: 'warning', custom: '' },
  ph: { include: true, choice: '7.4', custom: '' },
  temperature: { include: true, choice: '28', custom: '' },
});

/** `datetime-local` value (treated as UTC, minute precision) to ISO-8601 with an explicit Z. */
export function utcInputToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00.000Z`);
  return Number.isNaN(+d) ? null : d.toISOString();
}
export const isoToUtcInput = (iso: string) => new Date(iso).toISOString().slice(0, 16);

function numberFor(param: SimParam, input: ParamInput): { value?: number; error?: string } {
  const [lo, hi] = SIM_BOUNDS[param];
  const raw = input.choice === 'custom' ? input.custom.trim() : input.choice;
  if (raw === '' || !/^-?\d+(\.\d+)?$/.test(raw)) return { error: `Enter a number in ${SIM_UNIT[param]}.` };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `Enter a number in ${SIM_UNIT[param]}.` };
  if (n < lo || n > hi) return { error: `${SIM_LABEL[param]} must be between ${lo} and ${hi} ${SIM_UNIT[param]}.` };
  return { value: n };
}

/** Returns the request body to send, or field errors. Mirrors the server's rules; the server remains the authority. */
export function buildSimRequest(i: SimInput, now = new Date()): { ok: true; body: SimRequest } | { ok: false; errors: SimErrors } {
  const errors: SimErrors = {};
  if (!i.pondId) errors.pond = 'Choose a pond.';
  const body: SimRequest = { pondId: i.pondId };
  if (!SIM_PARAMS.some((p) => i[p].include)) errors.include = 'Include at least one parameter.';

  if (i.dissolved_oxygen.include) {
    if (i.dissolved_oxygen.choice === 'custom') {
      const r = numberFor('dissolved_oxygen', i.dissolved_oxygen);
      if (r.error) errors.dissolved_oxygen = r.error; else body.dissolvedOxygen = r.value;
    } else if (['healthy', 'warning', 'critical'].includes(i.dissolved_oxygen.choice)) body.scenario = i.dissolved_oxygen.choice as Scenario;
    else errors.dissolved_oxygen = 'Choose a preset or enter a custom value.';
  }
  for (const p of ['ph', 'temperature'] as const) {
    if (!i[p].include) continue;
    const r = numberFor(p, i[p]);
    if (r.error) errors[p] = r.error; else body[p] = r.value;
  }
  if (!i.useNow) {
    const iso = utcInputToIso(i.recordedAtInput);
    if (!iso) errors.recordedAt = 'Enter a valid UTC date and time.';
    else if (+new Date(iso) > +now + 5 * 60_000) errors.recordedAt = 'The reading time cannot be in the future.';
    else body.recordedAt = iso;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, body };
}
