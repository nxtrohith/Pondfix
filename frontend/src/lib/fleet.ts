import type { ApiClient } from './api/client';
import type { DataSource, Pond, PondSummary, RiskStatus } from './api/schemas';
import { RISK_ORDER } from './status';

export interface FleetRow {
  pond: Pond;
  summary: PondSummary | null;
  /** Newest recordedAt across parameters (ISO) or null. */
  latestAt: string | null;
  latestAgeMinutes: number | null;
  latestSource?: DataSource;
  risk: RiskStatus | 'ERROR';
}

export function toRow(pond: Pond, summary: PondSummary | null): FleetRow {
  let latestAt: string | null = null;
  let age: number | null = null;
  let latestSource: DataSource | undefined;
  for (const p of Object.values(summary?.parameters ?? {})) {
    if (!latestAt || Date.parse(p.recordedAt) > Date.parse(latestAt)) { latestAt = p.recordedAt; latestSource = p.source; }
    if (p.ageMinutes !== null && (age === null || p.ageMinutes < age)) age = p.ageMinutes;
  }
  return { pond, summary, latestAt, latestAgeMinutes: age, latestSource, risk: summary ? summary.riskStatus : 'ERROR' };
}

export const sortRows = (rows: FleetRow[]) =>
  [...rows].sort((a, b) => (a.risk === 'ERROR' ? 6 : RISK_ORDER[a.risk]) - (b.risk === 'ERROR' ? 6 : RISK_ORDER[b.risk]) || a.pond.name.localeCompare(b.pond.name));

export interface FleetStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  stale: number;
  noData: number;
  unknown: number;
  failed: number;
  attention: number;
  latestAt: string | null;
  latestAgeMinutes: number | null;
}

/** Counts reconcile: healthy + warning + critical + stale + noData + unknown + failed === total. */
export function fleetStats(rows: FleetRow[]): FleetStats {
  const s: FleetStats = { total: rows.length, healthy: 0, warning: 0, critical: 0, stale: 0, noData: 0, unknown: 0, failed: 0, attention: 0, latestAt: null, latestAgeMinutes: null };
  for (const r of rows) {
    switch (r.risk) {
      case 'NORMAL': s.healthy++; break;
      case 'WARNING': s.warning++; break;
      case 'CRITICAL': s.critical++; break;
      case 'STALE': s.stale++; break;
      case 'NO_DATA': s.noData++; break;
      case 'UNKNOWN': s.unknown++; break;
      case 'ERROR': s.failed++; break;
    }
    if (r.latestAt && (!s.latestAt || Date.parse(r.latestAt) > Date.parse(s.latestAt))) { s.latestAt = r.latestAt; s.latestAgeMinutes = r.latestAgeMinutes; }
  }
  s.attention = s.warning + s.critical;
  return s;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await fn(items[i]!) }; } catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  }));
  return out;
}

/** The API has no fleet-wide summary endpoint, so this fans out one /ponds/:id/summary call per pond. */
export async function loadFleet(api: ApiClient): Promise<{ rows: FleetRow[]; truncated: boolean }> {
  const { items, count } = await api.ponds();
  const results = await pool(items, 8, (p) => api.pondSummary(p.id));
  return { rows: items.map((p, i) => { const r = results[i]!; return toRow(p, r.status === 'fulfilled' ? r.value : null); }), truncated: count >= 200 };
}
