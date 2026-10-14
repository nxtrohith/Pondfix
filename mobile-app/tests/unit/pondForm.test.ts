import { NAME_MAX, NOTES_MAX, pondFromForm, validatePondForm, type PondFormValues } from '@/lib/pondForm';
import { DEMO_PONDS } from '@/data/mockPonds';

const ok: PondFormValues = { name: 'North Pond', speciesId: 'rohu', areaText: '2.5', notes: '' };

describe('pond form validation', () => {
  it('accepts a valid pond', () => {
    expect(validatePondForm(ok, DEMO_PONDS)).toEqual({});
  });
  it('requires a name, with a minimum and maximum length', () => {
    expect(validatePondForm({ ...ok, name: '   ' }, DEMO_PONDS).name).toMatch(/Enter a pond name/);
    expect(validatePondForm({ ...ok, name: 'A' }, DEMO_PONDS).name).toMatch(/at least 2/);
    expect(validatePondForm({ ...ok, name: 'x'.repeat(NAME_MAX + 1) }, DEMO_PONDS).name).toMatch(/no more than/);
  });
  it('rejects a name already used by another pond, ignoring case and extra spaces', () => {
    expect(validatePondForm({ ...ok, name: '  pond   1 ' }, DEMO_PONDS).name).toMatch(/already has this name/);
  });
  it('lets a pond keep its own name when editing it', () => {
    expect(validatePondForm({ ...ok, name: 'Pond 1' }, DEMO_PONDS, 'pond-1').name).toBeUndefined();
  });
  it('requires a positive area that is a plain number', () => {
    expect(validatePondForm({ ...ok, areaText: '' }, DEMO_PONDS).area).toMatch(/Enter the pond area/);
    expect(validatePondForm({ ...ok, areaText: 'abc' }, DEMO_PONDS).area).toMatch(/Enter a number/);
    expect(validatePondForm({ ...ok, areaText: '0' }, DEMO_PONDS).area).toMatch(/greater than zero/);
    expect(validatePondForm({ ...ok, areaText: '-3' }, DEMO_PONDS).area).toMatch(/Enter a number/);
    expect(validatePondForm({ ...ok, areaText: '501' }, DEMO_PONDS).area).toMatch(/500 acres or less/);
  });
  it('limits notes length', () => {
    expect(validatePondForm({ ...ok, notes: 'n'.repeat(NOTES_MAX + 1) }, DEMO_PONDS).notes).toMatch(/fewer/);
  });
  it('builds the stored pond from valid values, with a trimmed name and a numeric area', () => {
    expect(pondFromForm({ ...ok, name: '  East   Pond ', areaText: '1.5', notes: ' test ' }, 'local-1', true)).toEqual({
      id: 'local-1', displayName: 'East Pond', speciesId: 'rohu', areaAcres: 1.5, notes: 'test', localOnly: true,
    });
  });
  it('keeps "Not set" as an explicit null species', () => {
    expect(pondFromForm({ ...ok, speciesId: null }, 'x', true).speciesId).toBeNull();
  });
});
