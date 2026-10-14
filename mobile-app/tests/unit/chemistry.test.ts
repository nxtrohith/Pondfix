import { initialPondsState, pondsReducer, type PondsState } from '@/lib/pondState';
import { chemistryFor, readingsFor } from '@/lib/pondView';
import { summarizePond } from '@/lib/pondSummary';
import { formatValue } from '@/lib/format';
import { parameterLabel, parameterUnit, CHEMISTRY_HINT, CHEMISTRY_LABEL } from '@/lib/status';
import { CHEMISTRY_PARAMETERS, DERIVED_CHEMISTRY } from '@/types';
import type { PondSnapshot } from '@/services/ponds';
import type { Pond } from '@/types';

const T0 = '2026-10-14T10:00:00.000Z';
const pond: Pond = { id: 'p1', displayName: 'Pond 1', speciesId: null, speciesLabel: null, areaAcres: null, notes: '', localOnly: false };
const param = (value: number, source = 'simulated') => ({ value, unit: '', recordedAt: T0, source, measurementId: `m-${value}`, risk: 'UNKNOWN' as const, dataState: 'FRESH' });
const snapshot = (parameters: PondSnapshot['parameters']): PondSnapshot => ({ pondId: 'p1', snapshotAt: T0, seq: 1, staleAfterMinutes: 60, riskStatus: 'NORMAL', openAlerts: {}, latestPredictionGeneratedAt: null, parameters });
const boot = (parameters: PondSnapshot['parameters']): PondsState =>
  pondsReducer(initialPondsState, { type: 'bootstrap', items: [{ pond, snapshot: snapshot(parameters) }], serverTime: T0, deviceNowMs: Date.parse(T0), staleAfterMinutes: 60 });

describe('water chemistry (ammonia, nitrate, turbidity)', () => {
  it('is read from the snapshot with its source; a missing parameter is null, never zero', () => {
    const c = chemistryFor(boot({ ammonia: param(0.12), turbidity: param(31.4) }), pond);
    expect(c.map((x) => x.parameter)).toEqual(['ammonia', 'un_ionized_ammonia', 'nitrite', 'nitrate', 'alkalinity', 'salinity', 'turbidity']);
    expect(c[0]).toMatchObject({ latest: { value: 0.12, recordedAt: T0 }, source: 'simulated' });
    expect(c[3]).toMatchObject({ parameter: 'nitrate', latest: null, source: null });
  });

  it('never changes the pond status or the core readings', () => {
    const core = { dissolved_oxygen: param(6, 'live'), ph: param(7.8, 'live'), temperature: param(28, 'live') };
    const without = boot(core); const withChem = boot({ ...core, ammonia: param(9), nitrate: param(400), turbidity: param(900) });
    const status = (s: PondsState) => summarizePond(pond, readingsFor(s, pond), [], T0).status;
    expect(readingsFor(withChem, pond).map((r) => r.parameter)).toEqual(['dissolved_oxygen', 'ph', 'temperature']);
    expect(status(withChem)).toBe(status(without));
  });

  it('has labels, units and decimals', () => {
    expect(parameterLabel('ammonia')).toBe('Ammonia');
    expect(parameterUnit('turbidity')).toBe('NTU');
    expect(parameterUnit('nitrate')).toBe('mg/L');
    expect(formatValue(0.1234, 'ammonia')).toBe('0.12');
    expect(formatValue(31.26, 'turbidity')).toBe('31.3');
    expect(parameterLabel('nitrite')).toBe('Nitrite');
    expect(parameterUnit('salinity')).toBe('ppt');
    expect(formatValue(0.01234, 'un_ionized_ammonia')).toBe('0.012');
    expect(formatValue(112.4, 'alkalinity')).toBe('112');
  });

  it('knows which value is calculated and has a hint for every parameter', () => {
    expect(DERIVED_CHEMISTRY).toEqual(['un_ionized_ammonia']);
    for (const p of CHEMISTRY_PARAMETERS) { expect(CHEMISTRY_LABEL[p]).toBeTruthy(); expect(CHEMISTRY_HINT[p]).toBeTruthy(); }
  });
});
