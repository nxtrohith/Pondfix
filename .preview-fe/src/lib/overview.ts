// Presentation only: the one place that decides what the Overview headline says, so that it can never contradict the open alerts
// (and therefore the bell badge and the Alerts page, which count the same open alerts).
import type { Alert } from './api/schemas';
import type { FleetStats } from './fleet';

export interface OverviewSummary { headline: string; detail: string; tone: 'critical' | 'warning' | 'healthy' | 'muted'; testData: boolean }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `current` = open problems that were measured (not forecast). Marked-as-seen problems are still open, so they still count. */
export function summarizeOverview(stats: FleetStats, current: Pick<Alert, 'pondId' | 'severity' | 'dataSource'>[]): OverviewSummary {
  const critical = new Set(current.filter((a) => a.severity === 'CRITICAL').map((a) => a.pondId)).size;
  const affected = new Set(current.map((a) => a.pondId)).size;
  const testData = current.length > 0 && current.every((a) => a.dataSource === 'simulated');
  const quiet = stats.stale + stats.noData;
  const tail = [quiet ? `${quiet} with no recent reading` : '', stats.healthy ? `${stats.healthy} healthy` : ''].filter(Boolean).join(' · ');
  const test = testData ? ' (test data)' : '';
  if (critical > 0) return { headline: `${plural(critical, 'pond has', 'ponds have')} a critical problem${test}`, detail: tail || 'Open the problem below to see what to check.', tone: 'critical', testData };
  if (affected > 0) return { headline: `${plural(affected, 'pond needs', 'ponds need')} attention${test}`, detail: tail || 'Open the problem below to see what to check.', tone: 'warning', testData };
  if (!stats.total) return { headline: 'No ponds yet', detail: 'Ponds appear here once they are registered or imported.', tone: 'muted', testData: false };
  if (stats.critical + stats.warning > 0) return { headline: stats.critical > 0 ? `${plural(stats.critical, 'pond is', 'ponds are')} in a critical condition` : `${plural(stats.warning, 'pond needs', 'ponds need')} attention`, detail: tail, tone: stats.critical > 0 ? 'critical' : 'warning', testData: false };
  if (stats.healthy === stats.total) return { headline: stats.total === 1 ? 'Your pond is healthy' : `All ${stats.total} ponds are healthy`, detail: 'Everything is within the acceptable range.', tone: 'healthy', testData: false };
  if (stats.healthy > 0) return { headline: `${stats.healthy} of ${stats.total} ponds are healthy`, detail: quiet ? `${quiet} with no recent reading` : '', tone: 'healthy', testData: false };
  return { headline: 'No recent readings from any pond', detail: 'PondFix cannot tell how your ponds are doing until new readings arrive.', tone: 'muted', testData: false };
}
