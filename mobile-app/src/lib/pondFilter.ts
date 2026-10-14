// Search and status filtering for the pond list. Pure, so it is unit-tested.
import type { PondSummary } from './pondSummary';

export type PondFilter = 'ALL' | 'NORMAL' | 'WARNING' | 'CRITICAL';

/** Matches the pond name or species name (case-insensitive). ALL keeps every status; other filters match the pond status exactly. */
export function filterSummaries(summaries: PondSummary[], query: string, filter: PondFilter): PondSummary[] {
  const q = query.trim().toLowerCase();
  return summaries.filter((s) => {
    const matchesStatus = filter === 'ALL' || s.status === filter;
    const species = s.pond.speciesLabel ?? '';
    const matchesQuery = q === '' || s.pond.displayName.toLowerCase().includes(q) || species.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
}
