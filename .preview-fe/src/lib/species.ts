// Presentation and request-building helpers for species configuration. No threshold or classification logic lives here:
// the API owns which profile is validated and which rules apply; this file only words it and builds the request body.
import type { CatalogueEntry, ReferenceRange, SpeciesConfig, SpeciesRequest } from './api/schemas';
import type { Tone } from './status';

export const SAFETY_LABEL: Record<SpeciesConfig['safetyProfile']['status'], { label: string; tone: Tone }> = {
  validated: { label: 'Validated alert limits', tone: 'healthy' },
  reference_only: { label: 'Reference ranges only', tone: 'warning' },
  not_validated: { label: 'No validated safety profile', tone: 'warning' },
};

/** "Rohu", "Species not set", "Polyculture: Rohu, Catla" (the API's own label). */
export const speciesLabel = (s?: SpeciesConfig) => s?.label ?? 'Species not set';
export const isConfigured = (s?: SpeciesConfig) => s?.state === 'configured';
/** Short line shown under a pond name: species plus Fish/Shrimp, or an explicit "not set". */
export const speciesLine = (s?: SpeciesConfig) => (isConfigured(s) ? `${s!.label}${s!.cultureLabel && s!.mode === 'single' && s!.cultureLabel !== 'Custom' ? ` (${s!.cultureLabel.toLowerCase()})` : ''}` : 'Species not set');

export const RULE_SCOPE_LABEL = { species: 'Species-specific limits', general: 'General safety rules' } as const;

const PARAM_TEXT: Record<string, string> = { temperature: 'Temperature', ph: 'pH', dissolved_oxygen: 'Dissolved oxygen', salinity: 'Salinity' };
export const REFERENCE_KIND: Record<string, string> = { preferred_growth_range: 'preferred growth range', general_reference: 'general reference', operating_target: 'operating target' };

/** "24 to 31 °C", "at least 5 mg/L", "above 4 mg/L". */
export function rangeText(r: ReferenceRange, fallbackUnit = ''): string {
  const unit = r.unit === 'C' ? '°C' : r.unit === 'pH' ? '' : (r.unit ?? fallbackUnit);
  const sfx = unit ? ` ${unit}` : '';
  if (r.min !== undefined && r.max !== undefined) return `${r.min} to ${r.max}${sfx}`;
  if (r.min !== undefined) return `at least ${r.min}${sfx}`;
  if (r.above !== undefined) return `above ${r.above}${sfx}`;
  if (r.max !== undefined) return `up to ${r.max}${sfx}`;
  return 'not specified';
}
const UNIT_FOR: Record<string, string> = { temperature: '°C', ph: '', dissolved_oxygen: 'mg/L' };

/** Reference lines for a catalogue entry; parameters without a supplied range are omitted (never defaulted). */
export function referenceLines(entry?: CatalogueEntry): { parameter: string; label: string; text: string; kind: string }[] {
  if (!entry) return [];
  return Object.entries(entry.reference).flatMap(([p, r]) => (r ? [{ parameter: p, label: PARAM_TEXT[p] ?? p, text: rangeText(r, UNIT_FOR[p] ?? ''), kind: REFERENCE_KIND[r.kind ?? ''] ?? 'reference' }] : []));
}

export interface PolyRow { checked: boolean; percent: string }
export interface SpeciesDraft { mode: 'single' | 'polyculture'; speciesId: string; customName: string; poly: Record<string, PolyRow> }

export function draftFrom(s?: SpeciesConfig): SpeciesDraft {
  const poly: Record<string, PolyRow> = {};
  if (s?.mode === 'polyculture') for (const c of s.composition ?? []) poly[c.speciesProfileId] = { checked: true, percent: c.proportionPercent !== undefined ? String(c.proportionPercent) : '' };
  return { mode: s?.mode === 'polyculture' ? 'polyculture' : 'single', speciesId: s?.mode === 'single' ? s.speciesProfileId ?? '' : '', customName: s?.customSpeciesName ?? '', poly };
}

export type DraftResult = { ok: true; body: SpeciesRequest } | { ok: false; error: string };
/** Client-side check for fast feedback; the API validates again and is authoritative. */
export function buildSpeciesRequest(d: SpeciesDraft, catalogue: CatalogueEntry[]): DraftResult {
  if (d.mode === 'single') {
    const entry = catalogue.find((c) => c.id === d.speciesId);
    if (!entry) return { ok: false, error: 'Choose a species.' };
    if (entry.requiresCustomName) {
      const name = d.customName.trim();
      if (!name) return { ok: false, error: 'Enter the name of the species.' };
      return { ok: true, body: { mode: 'single', speciesProfileId: entry.id, customSpeciesName: name } };
    }
    return { ok: true, body: { mode: 'single', speciesProfileId: entry.id } };
  }
  const chosen = Object.entries(d.poly).filter(([, r]) => r.checked);
  if (chosen.length < 2) return { ok: false, error: 'Choose at least two species for a mixed-species pond.' };
  const given = chosen.filter(([, r]) => r.percent.trim() !== '');
  if (given.length !== 0 && given.length !== chosen.length) return { ok: false, error: 'Enter a share for every species, or leave all shares empty. Shares are never assumed.' };
  const species = chosen.map(([id, r]) => ({ speciesProfileId: id, ...(given.length ? { proportionPercent: Number(r.percent) } : {}) }));
  if (given.length) {
    if (species.some((s) => !Number.isFinite(s.proportionPercent) || s.proportionPercent! <= 0 || s.proportionPercent! > 100)) return { ok: false, error: 'Each share must be a number above 0 and at most 100.' };
    const total = species.reduce((a, s) => a + s.proportionPercent!, 0);
    if (Math.abs(total - 100) > 0.01) return { ok: false, error: `Shares must total 100% (currently ${Math.round(total * 100) / 100}%).` };
  }
  return { ok: true, body: { mode: 'polyculture', species } };
}
