// Illustrative species information. The reference ranges match the web app's species catalogue (backend/src/services/speciesProfiles.js)
// and come from the project brief. They are PROVISIONAL preferred-growth context, not validated alert limits.
// Names, care notes and range labels come from the dictionaries (species.*), so they follow the active language; scientific names and the
// numbers stay as they are.
import type { SpeciesProfile } from '@/types';
import { t } from '@/i18n';
import en from '@/i18n/locales/en';

type SpeciesId = 'rohu' | 'catla' | 'mrigal' | 'vannamei' | 'pangasius' | 'common_carp' | 'grass_carp' | 'other';
type RangeLabel = 'preferredGrowth' | 'poolFishReference' | 'operatingTarget' | 'reference' | 'referenceLevel';
type Preferred = SpeciesProfile['preferred'];

const range = (label: RangeLabel, r: { min?: number; max?: number; above?: number }) => ({ ...r, get label() { return t(`species.rangeLabel.${label}`); } });

function species(id: SpeciesId, scientificName: string | null, cultureLabel: SpeciesProfile['cultureLabel'], validation: SpeciesProfile['validation'], preferred: Preferred, requiresCustomName = false): SpeciesProfile {
  return { id, scientificName, cultureLabel, validation, preferred, requiresCustomName, get displayName() { return t(`species.items.${id}.name`); }, get care() { return t(`species.items.${id}.care`); } };
}

const carp = (temp: [number, number]): Preferred => ({ temperature: range('preferredGrowth', { min: temp[0], max: temp[1] }), ph: range('poolFishReference', { min: 6.5, max: 8.5 }), dissolved_oxygen: range('operatingTarget', { min: 5 }) });

export const SPECIES: SpeciesProfile[] = [
  species('rohu', 'Labeo rohita', 'Fish', 'reference_only', carp([24, 31])),
  species('catla', 'Catla catla', 'Fish', 'reference_only', carp([26, 29])),
  species('mrigal', 'Cirrhinus mrigala', 'Fish', 'reference_only', carp([22, 32])),
  species('vannamei', 'Litopenaeus vannamei', 'Shrimp', 'reference_only', { temperature: range('reference', { min: 28, max: 32 }), ph: range('reference', { min: 7.5, max: 8.5 }), dissolved_oxygen: range('referenceLevel', { above: 4 }) }),
  species('pangasius', null, 'Fish', 'not_validated', {}),
  species('common_carp', 'Cyprinus carpio', 'Fish', 'not_validated', {}),
  species('grass_carp', 'Ctenopharyngodon idella', 'Fish', 'not_validated', {}),
  species('other', null, 'Custom', 'not_validated', {}, true),
];

export const speciesById = (id: string | null | undefined): SpeciesProfile | undefined => SPECIES.find((s) => s.id === id);

/** The backend sends species as English text ("Rohu"). A catalogue species is shown in the active language; anything else (a custom name, a polyculture description) stays as sent. */
export function localizeSpeciesLabel(label: string): string {
  const id = (Object.keys(en.species.items) as SpeciesId[]).find((k) => en.species.items[k].name.toLowerCase() === label.trim().toLowerCase() && k !== 'other');
  return id ? t(`species.items.${id}.name`) : label;
}

/** A pond's species name in the active language: the dictionary name when the pond uses a catalogue species, else the backend's own label. */
export function speciesName(pond: { speciesId: string | null; speciesLabel?: string | null }): string | null {
  const known = SPECIES.find((s) => s.id === pond.speciesId && s.id !== 'other');
  return known ? known.displayName : pond.speciesLabel ?? null;
}
