import { filterSummaries } from '@/lib/pondFilter';
import { fleetCounts, summarizePond } from '@/lib/pondSummary';
import { DEMO_ALERTS } from '@/data/mockAlerts';
import { DEMO_AS_OF, DEMO_PONDS } from '@/data/mockPonds';
import { demoReadings } from '@/data/mockReadings';

const all = DEMO_PONDS.map((p) => summarizePond(p, demoReadings(p.id), DEMO_ALERTS, DEMO_AS_OF));
const names = (xs: { pond: { displayName: string } }[]) => xs.map((x) => x.pond.displayName);

describe('pond search and status filter', () => {
  it('shows everything with no query and the ALL filter', () => {
    expect(names(filterSummaries(all, '', 'ALL'))).toEqual(['Pond 1', 'Pond 2', 'Pond 3', 'Pond 4']);
  });
  it('searches pond names case-insensitively', () => {
    expect(names(filterSummaries(all, 'POND 3', 'ALL'))).toEqual(['Pond 3']);
  });
  it('searches species names too', () => {
    expect(names(filterSummaries(all, 'vannamei', 'ALL'))).toEqual(['Pond 4']);
  });
  it('filters by status', () => {
    expect(names(filterSummaries(all, '', 'CRITICAL'))).toEqual(['Pond 1']);
    expect(names(filterSummaries(all, '', 'WARNING'))).toEqual(['Pond 2', 'Pond 3']);
    expect(names(filterSummaries(all, '', 'NORMAL'))).toEqual(['Pond 4']);
  });
  it('combines search and status', () => {
    expect(names(filterSummaries(all, 'pond', 'WARNING'))).toEqual(['Pond 2', 'Pond 3']);
    expect(filterSummaries(all, 'pond 1', 'WARNING')).toEqual([]);
  });
  it('a search that matches nothing returns an empty list', () => {
    expect(filterSummaries(all, 'zzz', 'ALL')).toEqual([]);
  });
});

describe('fleet counts', () => {
  it('counts each pond once, so tiles add up', () => {
    expect(fleetCounts(all)).toEqual({ total: 4, healthy: 1, warning: 2, critical: 1, incomplete: 0, noData: 0 });
  });
});
