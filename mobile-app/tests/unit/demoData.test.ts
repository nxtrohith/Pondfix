// Cross-screen consistency for the demo data. Every screen derives from these same records, so these checks keep them honest.
import { TEST_ALERTS as DEMO_ALERTS } from '../fixtures/alerts';
import { DEMO_AS_OF, DEMO_PONDS } from '../fixtures/mockPonds';
import { DEMO_FORECASTS, demoReadings } from '../fixtures/mockReadings';
import { SPECIES } from '@/data/mockSpecies';
import { fleetCounts, summarizePond } from '@/lib/pondSummary';

const summaries = () => DEMO_PONDS.map((p) => summarizePond(p, demoReadings(p.id), DEMO_ALERTS, DEMO_AS_OF));

describe('demo data consistency', () => {
  it('uses display names Pond 1 to Pond 4 and internal ids that are not display names', () => {
    expect(DEMO_PONDS.map((p) => p.displayName)).toEqual(['Pond 1', 'Pond 2', 'Pond 3', 'Pond 4']);
    for (const p of DEMO_PONDS) expect(p.id).not.toBe(p.displayName);
  });

  it('dashboard counts add up to the number of ponds, with each pond in exactly one bucket', () => {
    const c = fleetCounts(summaries());
    expect(c.total).toBe(DEMO_PONDS.length);
    expect(c.healthy + c.warning + c.critical + c.incomplete + c.noData).toBe(c.total);
  });

  it('matches the illustrative story: Pond 1 critical, Pond 2 and 3 warning, Pond 4 healthy', () => {
    const byName = Object.fromEntries(summaries().map((s) => [s.pond.displayName, s.status]));
    expect(byName).toEqual({ 'Pond 1': 'CRITICAL', 'Pond 2': 'WARNING', 'Pond 3': 'WARNING', 'Pond 4': 'NORMAL' });
  });

  it('the offline temperature sensor on Pond 2 has no current reading and no chart series', () => {
    const temp = demoReadings('pond-2').find((r) => r.parameter === 'temperature')!;
    expect(temp.sensor).toBe('offline');
    expect(temp.latest).toBeNull();
    expect(temp.series).toEqual([]);
    expect(summaries()[1]!.parameters.temperature.status).toBe('UNAVAILABLE');
  });

  it('each chart series ends at the latest reading, so the chart and the pond screen show the same value', () => {
    for (const p of DEMO_PONDS) {
      for (const r of demoReadings(p.id)) {
        if (!r.latest) continue;
        const last = r.series[r.series.length - 1]!;
        expect(last.value).toBe(r.latest.value);
        expect(last.at).toBe(r.latest.recordedAt);
      }
    }
  });

  it('forecasts exist only for ponds and parameters that have current readings', () => {
    for (const [pondId, byParam] of Object.entries(DEMO_FORECASTS)) {
      for (const [param] of Object.entries(byParam)) {
        const r = demoReadings(pondId).find((x) => x.parameter === param);
        expect(r?.latest).toBeTruthy();
      }
    }
  });

  it('species catalogue has the eight culture options from the brief, with stable ids', () => {
    expect(SPECIES.map((s) => s.id)).toEqual(['rohu', 'catla', 'mrigal', 'vannamei', 'pangasius', 'common_carp', 'grass_carp', 'other']);
    for (const s of SPECIES) expect(s.validation).not.toBe('validated');
  });
});
