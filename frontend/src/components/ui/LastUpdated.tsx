import { formatAge, formatDateTime } from '@/lib/format';

/** "Updated 12 min ago" with the exact time on hover. Nothing is claimed when there is no reading. */
export function LastUpdated({ at, ageMinutes, className }: { at: string | null | undefined; ageMinutes?: number | null; className?: string }) {
  if (!at) return <span className={className}>No reading yet</span>;
  return <span className={className} title={formatDateTime(at)}>Updated {formatAge(ageMinutes ?? null)}</span>;
}
