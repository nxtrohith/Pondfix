// Illustrative species information. The reference ranges match the web app's species catalogue (backend/src/services/speciesProfiles.js)
// and come from the project brief. They are PROVISIONAL preferred-growth context, not validated alert limits.
import type { SpeciesProfile } from '@/types';

export const SPECIES: SpeciesProfile[] = [
  {
    id: 'rohu', displayName: 'Rohu', scientificName: 'Labeo rohita', cultureLabel: 'Fish', validation: 'reference_only', requiresCustomName: false,
    preferred: { temperature: { min: 24, max: 31, label: 'Preferred growth range' }, ph: { min: 6.5, max: 8.5, label: 'General pond-fish reference' }, dissolved_oxygen: { min: 5, label: 'Operating target' } },
    care: 'Keep aeration ready for low-oxygen periods, and avoid sudden temperature changes when topping up water.',
  },
  {
    id: 'catla', displayName: 'Catla', scientificName: 'Catla catla', cultureLabel: 'Fish', validation: 'reference_only', requiresCustomName: false,
    preferred: { temperature: { min: 26, max: 29, label: 'Preferred growth range' }, ph: { min: 6.5, max: 8.5, label: 'General pond-fish reference' }, dissolved_oxygen: { min: 5, label: 'Operating target' } },
    care: 'Feed in measured amounts and check oxygen before heavy feeding days.',
  },
  {
    id: 'mrigal', displayName: 'Mrigal', scientificName: 'Cirrhinus mrigala', cultureLabel: 'Fish', validation: 'reference_only', requiresCustomName: false,
    preferred: { temperature: { min: 22, max: 32, label: 'Preferred growth range' }, ph: { min: 6.5, max: 8.5, label: 'General pond-fish reference' }, dissolved_oxygen: { min: 5, label: 'Operating target' } },
    care: 'Watch water temperature in warm spells, when oxygen demand rises.',
  },
  {
    id: 'vannamei', displayName: 'Vannamei shrimp', scientificName: 'Litopenaeus vannamei', cultureLabel: 'Shrimp', validation: 'reference_only', requiresCustomName: false,
    preferred: { temperature: { min: 28, max: 32, label: 'Reference range' }, ph: { min: 7.5, max: 8.5, label: 'Reference range' }, dissolved_oxygen: { above: 4, label: 'Reference level' } },
    care: 'Salinity depends on the culture system and is not tracked by this app. Confirm it with your farm records.',
  },
  {
    id: 'pangasius', displayName: 'Pangasius', scientificName: null, cultureLabel: 'Fish', validation: 'not_validated', requiresCustomName: false,
    preferred: {},
    care: 'The exact species has not been configured, so no reference ranges are shown. Use the general safety rules.',
  },
  {
    id: 'common_carp', displayName: 'Common carp', scientificName: 'Cyprinus carpio', cultureLabel: 'Fish', validation: 'not_validated', requiresCustomName: false,
    preferred: {},
    care: 'No reference ranges have been supplied for this species yet. Use the general safety rules.',
  },
  {
    id: 'grass_carp', displayName: 'Grass carp', scientificName: 'Ctenopharyngodon idella', cultureLabel: 'Fish', validation: 'not_validated', requiresCustomName: false,
    preferred: {},
    care: 'No reference ranges have been supplied for this species yet. Use the general safety rules.',
  },
  {
    id: 'other', displayName: 'Other / custom', scientificName: null, cultureLabel: 'Custom', validation: 'not_validated', requiresCustomName: true,
    preferred: {},
    care: 'A custom species has no safety profile in PondFix, so only the general safety rules apply.',
  },
];

export const speciesById = (id: string | null | undefined): SpeciesProfile | undefined => SPECIES.find((s) => s.id === id);
