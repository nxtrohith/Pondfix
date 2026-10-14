import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ speciesProfiles: vi.fn(), saveSpecies: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }), usePathname: () => '/ponds/p1' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { ApiError } from '@/lib/api/client';
import { SpeciesSettings } from '@/components/features/SpeciesSettings';
import { AlertCard } from '@/components/features/AlertCard';
import { PondCard } from '@/components/features/PondCard';
import { PondTooltip } from '@/components/farm/PondTooltip';
import { buildSpeciesRequest, draftFrom, speciesLine } from '@/lib/species';
import { snapshotOf } from '@/lib/farm';
import { toRow } from '@/lib/fleet';
import { speciesCatalogueResponse, speciesConfigSchema, type Alert, type CatalogueEntry, type SpeciesConfig } from '@/lib/api/schemas';

const sp = (id: string, displayName: string, scientificName: string | null, cultureLabel = 'Fish', extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id, displayName, scientificName, cultureType: 'freshwater_fish', cultureLabel, requiresCustomName: false,
  safetyProfile: { status: 'reference_only', alertsEnabled: false, version: null, message: 'Reference ranges only. No approved alert limits exist for this species yet, so the general rules decide alerts.' },
  reference: {}, notes: [], ...extra,
});
const CATALOGUE: CatalogueEntry[] = [
  sp('rohu', 'Rohu', 'Labeo rohita', 'Fish', { reference: { temperature: { min: 24, max: 31, kind: 'preferred_growth_range' }, dissolved_oxygen: { min: 5, kind: 'operating_target' } } }),
  sp('catla', 'Catla', 'Catla catla'),
  sp('vannamei', 'Vannamei shrimp', 'Litopenaeus vannamei', 'Shrimp'),
  sp('other', 'Other / custom', null, 'Custom', { requiresCustomName: true }),
];
const UNSET: SpeciesConfig = { state: 'unconfigured', mode: 'unconfigured', label: 'Species not set', cultureType: null, cultureLabel: null, safetyProfile: { status: 'not_validated', alertsEnabled: false, ruleScope: 'general', version: null, message: 'No species has been selected for this pond. The general safety rules apply; select a species to see its reference ranges.' } };
const ROHU: SpeciesConfig = { state: 'configured', mode: 'single', speciesProfileId: 'rohu', label: 'Rohu', scientificName: 'Labeo rohita', cultureType: 'freshwater_fish', cultureLabel: 'Fish', safetyProfile: { status: 'reference_only', alertsEnabled: false, ruleScope: 'general', version: null, message: 'Reference ranges only. No approved alert limits exist for this species yet, so the general rules decide alerts.' } };
const pondOf = (speciesConfig: SpeciesConfig) => ({ id: 'p1', name: 'Pond 1', status: 'active', speciesConfig });

beforeEach(() => {
  vi.clearAllMocks();
  api.speciesProfiles.mockResolvedValue({ items: CATALOGUE, policyVersion: null, note: 'n' });
});

describe('species request building', () => {
  it('requires a species, a custom name for Other, and complete proportions that total 100%', () => {
    expect(buildSpeciesRequest({ mode: 'single', speciesId: '', customName: '', poly: {} }, CATALOGUE)).toMatchObject({ ok: false });
    expect(buildSpeciesRequest({ mode: 'single', speciesId: 'other', customName: ' ', poly: {} }, CATALOGUE)).toMatchObject({ ok: false });
    expect(buildSpeciesRequest({ mode: 'single', speciesId: 'other', customName: ' Tilapia ', poly: {} }, CATALOGUE)).toEqual({ ok: true, body: { mode: 'single', speciesProfileId: 'other', customSpeciesName: 'Tilapia' } });
    expect(buildSpeciesRequest({ mode: 'single', speciesId: 'rohu', customName: 'ignored', poly: {} }, CATALOGUE)).toEqual({ ok: true, body: { mode: 'single', speciesProfileId: 'rohu' } });
    const poly = (a: string, b: string) => buildSpeciesRequest({ mode: 'polyculture', speciesId: '', customName: '', poly: { rohu: { checked: true, percent: a }, catla: { checked: true, percent: b } } }, CATALOGUE);
    expect(poly('', '')).toEqual({ ok: true, body: { mode: 'polyculture', species: [{ speciesProfileId: 'rohu' }, { speciesProfileId: 'catla' }] } });
    expect(poly('60', '40')).toMatchObject({ ok: true });
    expect(poly('60', '30')).toMatchObject({ ok: false, error: expect.stringContaining('100%') });
    expect(poly('60', '')).toMatchObject({ ok: false });
    expect(buildSpeciesRequest({ mode: 'polyculture', speciesId: '', customName: '', poly: { rohu: { checked: true, percent: '' } } }, CATALOGUE)).toMatchObject({ ok: false });
  });
  it('speciesLine is explicit about an unset species', () => {
    expect(speciesLine(undefined)).toBe('Species not set'); expect(speciesLine(UNSET)).toBe('Species not set'); expect(speciesLine(ROHU)).toBe('Rohu (fish)');
    expect(draftFrom(ROHU)).toMatchObject({ mode: 'single', speciesId: 'rohu' });
  });
  it('API schemas accept an older pond without speciesConfig and reject nonsense statuses', () => {
    expect(speciesCatalogueResponse.safeParse({ items: CATALOGUE, policyVersion: null, note: 'n' }).success).toBe(true);
    expect(speciesConfigSchema.safeParse({ ...ROHU, safetyProfile: { ...ROHU.safetyProfile, status: 'fine' } }).success).toBe(false);
  });
});

describe('SpeciesSettings', () => {
  const open = async (initial: SpeciesConfig) => { render(<SpeciesSettings pondId="p1" pondName="Pond 1" initial={initial} />); await waitFor(() => expect(api.speciesProfiles).toHaveBeenCalled()); };

  it('shows an unconfigured pond explicitly and says the general rules still apply', async () => {
    await open(UNSET);
    expect(screen.getByText('Species not set')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('No species selected');
    expect(screen.getByRole('note')).toHaveTextContent('general safety rules still raise alerts');
    expect(screen.getByRole('button', { name: /Select species/ })).toBeInTheDocument();
  });

  it('saves through the API, then shows the value the server returned', async () => {
    api.saveSpecies.mockResolvedValue(pondOf(ROHU));
    await open(UNSET);
    fireEvent.click(await screen.findByRole('button', { name: /Select species/ }));
    fireEvent.change(await screen.findByLabelText('Species'), { target: { value: 'rohu' } });
    expect(screen.getByText(/Labeo rohita · Fish/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save species' }));
    await screen.findByText(/Saved\. Pond 1 is now set to Rohu/);
    expect(api.saveSpecies).toHaveBeenCalledWith('p1', { mode: 'single', speciesProfileId: 'rohu' });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText('Reference ranges only')).toBeInTheDocument();
    expect(screen.getByText(/24 to 31 °C/)).toBeInTheDocument();
    expect(screen.getByText(/at least 5 mg\/L/)).toBeInTheDocument();
    expect(screen.getByText(/context only, not alert limits/)).toBeInTheDocument();
  });

  it('shows API errors honestly and never a success message or a changed species', async () => {
    api.saveSpecies.mockRejectedValue(new ApiError('http', 'species configuration is invalid', 422, 'VALIDATION_ERROR', [{ path: 'speciesProfileId', message: 'must be one of: rohu' }]));
    await open(UNSET);
    fireEvent.click(await screen.findByRole('button', { name: /Select species/ }));
    fireEvent.change(await screen.findByLabelText('Species'), { target: { value: 'catla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save species' }));
    expect(await screen.findByText(/Not saved\./)).toBeInTheDocument();
    expect(screen.getByText(/must be one of: rohu/)).toBeInTheDocument();
    expect(screen.queryByText(/^Saved\./)).toBeNull(); expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Species not set')).toBeInTheDocument();
  });

  it('shows a network failure as not saved', async () => {
    api.saveSpecies.mockRejectedValue(new ApiError('network', 'Could not reach the AquaGuard API. Check that the backend is running.'));
    await open(UNSET);
    fireEvent.click(await screen.findByRole('button', { name: /Select species/ }));
    fireEvent.change(await screen.findByLabelText('Species'), { target: { value: 'rohu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save species' }));
    expect(await screen.findByText(/Could not reach the AquaGuard API/)).toBeInTheDocument();
    expect(screen.queryByText(/^Saved\./)).toBeNull();
  });

  it('asks for confirmation before changing a configured species, and keeps the old value if cancelled', async () => {
    await open(ROHU);
    fireEvent.click(await screen.findByRole('button', { name: /Change species/ }));
    fireEvent.change(await screen.findByLabelText('Species'), { target: { value: 'catla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save species' }));
    const dlg = await screen.findByRole('dialog', { hidden: true });
    expect(dlg).toHaveTextContent('Change the species for this pond?'); expect(dlg).toHaveTextContent('which alerts appear may change'); expect(dlg).toHaveTextContent('not edited or closed');
    expect(api.saveSpecies).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel', hidden: true }));
    expect(api.saveSpecies).not.toHaveBeenCalled();
  });

  it('applies the change only after confirming', async () => {
    api.saveSpecies.mockResolvedValue(pondOf({ ...ROHU, speciesProfileId: 'catla', label: 'Catla', scientificName: 'Catla catla' }));
    await open(ROHU);
    fireEvent.click(await screen.findByRole('button', { name: /Change species/ }));
    fireEvent.change(await screen.findByLabelText('Species'), { target: { value: 'catla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save species' }));
    const dlg = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Change species', hidden: true }));
    await screen.findByText(/is now set to Catla/);
    expect(api.saveSpecies).toHaveBeenCalledWith('p1', { mode: 'single', speciesProfileId: 'catla' });
  });
});

describe('species shown consistently', () => {
  const baseAlert: Alert = { id: 'a1', pondId: 'p1', origin: 'observed', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 2.2, threshold: 3, direction: 'low', message: 'm', status: 'ACTIVE', createdAt: '2026-03-01T12:00:00Z', lastTriggeredAt: '2026-03-01T12:00:00Z', dataSource: 'live' };

  it('alert card names the species, parameter, value, limit source, reference, why and next step', () => {
    render(<AlertCard alert={{ ...baseAlert, ruleScope: 'general', speciesLabel: 'Rohu', referenceRange: { min: 5, kind: 'operating_target', unit: 'mg/L' }, explanation: 'Low dissolved oxygen can stress aquatic stock. Classified with the general safety rules.', recommendedAction: 'Verify the sensor reading, inspect stock behaviour, check aeration, and follow your farm’s operating procedure.' }} pondName="Pond 1" showGuidance />);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('Pond 1'); expect(card).toHaveTextContent('Species:Rohu'); expect(card).toHaveTextContent('Current: 2.20 mg/L');
    expect(card).toHaveTextContent('General safety rules'); expect(card).toHaveTextContent('not specific to a species');
    expect(card).toHaveTextContent('at least 5 mg/L'); expect(card).toHaveTextContent('context, not an alert limit');
    expect(card).toHaveTextContent('Low dissolved oxygen can stress'); expect(card).toHaveTextContent('Recommended next step: Verify the sensor reading');
  });

  it('alert card labels species-specific limits with their version, and an unset species plainly', () => {
    const { rerender } = render(<AlertCard alert={{ ...baseAlert, ruleScope: 'species', speciesLabel: 'Rohu', profileVersion: 'rohu-v1' }} />);
    expect(screen.getByRole('article')).toHaveTextContent('Species-specific limits (rohu-v1)');
    rerender(<AlertCard alert={baseAlert} />);
    expect(screen.getByRole('article')).toHaveTextContent('Species:not set'); expect(screen.getByRole('article')).toHaveTextContent('General safety rules');
  });

  it('pond card, digital-twin tooltip and snapshot all show the same saved species, or an explicit not-set', () => {
    const rowSet = toRow(pondOf(ROHU), null); const rowUnset = toRow(pondOf(UNSET), null);
    const { unmount } = render(<PondCard row={rowSet} />);
    expect(screen.getByText('Rohu (fish)')).toBeInTheDocument(); unmount();
    render(<PondCard row={rowUnset} />);
    expect(screen.getByText('Species not set')).toBeInTheDocument();
    expect(snapshotOf(rowSet)).toMatchObject({ species: 'Rohu (fish)', speciesSet: true, risk: 'ERROR' });
    expect(snapshotOf(rowUnset)).toMatchObject({ species: 'Species not set', speciesSet: false });
    render(<PondTooltip snap={snapshotOf(rowSet)} />);
    expect(screen.getAllByText('Rohu (fish)').length).toBeGreaterThan(0);
  });

  it('the twin colour still comes from the backend risk, never from the species', () => {
    const summary = { pond: pondOf(UNSET), riskStatus: 'CRITICAL' as const, riskBasis: [], staleAfterMinutes: 60, parameters: {}, openAlerts: {}, latestPredictionGeneratedAt: null };
    expect(snapshotOf(toRow(pondOf(UNSET), summary))).toMatchObject({ risk: 'CRITICAL', tone: 'critical', speciesSet: false });
    const none = snapshotOf(toRow(pondOf(UNSET), { ...summary, riskStatus: 'NO_DATA' }));
    expect(none.tone).not.toBe('healthy');
  });
});
