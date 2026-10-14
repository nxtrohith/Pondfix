// Validation for the add/edit pond form. Pure functions so the rules are unit-tested without rendering the screen.
import type { Pond } from '@/types';

export interface PondFormValues { name: string; speciesId: string | null; areaText: string; notes: string }
export type PondFormErrors = Partial<Record<'name' | 'area' | 'notes', string>>;

export const NAME_MIN = 2;
export const NAME_MAX = 40;
export const NOTES_MAX = 300;
export const AREA_MAX_ACRES = 500;

export function validatePondForm(values: PondFormValues, existing: Pond[], editingId?: string): PondFormErrors {
  const errors: PondFormErrors = {};
  const name = values.name.trim().replace(/\s+/g, ' ');
  if (name.length === 0) errors.name = 'Enter a pond name.';
  else if (name.length < NAME_MIN) errors.name = `Use at least ${NAME_MIN} characters.`;
  else if (name.length > NAME_MAX) errors.name = `Use no more than ${NAME_MAX} characters.`;
  else if (existing.some((p) => p.id !== editingId && p.displayName.toLowerCase() === name.toLowerCase())) errors.name = 'Another pond already has this name.';

  const area = values.areaText.trim();
  if (area.length === 0) errors.area = 'Enter the pond area in acres.';
  else if (!/^\d+(\.\d{1,2})?$/.test(area)) errors.area = 'Enter a number, for example 2.5.';
  else if (Number(area) <= 0) errors.area = 'The area must be greater than zero.';
  else if (Number(area) > AREA_MAX_ACRES) errors.area = `The area must be ${AREA_MAX_ACRES} acres or less.`;

  if (values.notes.length > NOTES_MAX) errors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  return errors;
}

/** Converts validated form values into the stored pond shape. Call only after validatePondForm returns no errors. */
export function pondFromForm(values: PondFormValues, id: string, localOnly: boolean): Pond {
  return {
    id,
    displayName: values.name.trim().replace(/\s+/g, ' '),
    speciesId: values.speciesId,
    areaAcres: Number(values.areaText.trim()),
    notes: values.notes.trim(),
    localOnly,
  };
}
