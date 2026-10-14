export type Scenario = 'healthy' | 'warning' | 'critical';

/** `datetime-local` value (treated as UTC, minute precision) to ISO-8601 with an explicit Z. */
export function utcInputToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00.000Z`);
  return Number.isNaN(+d) ? null : d.toISOString();
}
export const isoToUtcInput = (iso: string) => new Date(iso).toISOString().slice(0, 16);

export interface SimInput { pondId: string; mode: 'scenario' | 'custom'; scenario: Scenario; customDo: string; useNow: boolean; recordedAtInput: string }
export type SimRequest = { pondId: string; scenario?: Scenario; dissolvedOxygen?: number; recordedAt?: string };

/** Returns the request body to send, or field errors. Mirrors the server's rules; the server remains the authority. */
export function buildSimRequest(i: SimInput, now = new Date()): { ok: true; body: SimRequest } | { ok: false; errors: { doValue?: string; recordedAt?: string; pond?: string } } {
  const errors: { doValue?: string; recordedAt?: string; pond?: string } = {};
  if (!i.pondId) errors.pond = 'Choose a pond.';
  const body: SimRequest = { pondId: i.pondId };
  if (i.mode === 'scenario') body.scenario = i.scenario;
  else {
    const n = Number(i.customDo);
    if (i.customDo.trim() === '' || !Number.isFinite(n)) errors.doValue = 'Enter a number in mg/L.';
    else if (n < 0 || n > 50) errors.doValue = 'Dissolved oxygen must be between 0 and 50 mg/L.';
    else body.dissolvedOxygen = n;
  }
  if (!i.useNow) {
    const iso = utcInputToIso(i.recordedAtInput);
    if (!iso) errors.recordedAt = 'Enter a valid UTC date and time.';
    else if (+new Date(iso) > +now + 5 * 60_000) errors.recordedAt = 'The reading time cannot be in the future.';
    else body.recordedAt = iso;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, body };
}
