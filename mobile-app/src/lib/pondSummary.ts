// Derives every pond-level number the screens show (status, counts, active alerts) from one place, so the dashboard, lists,
// details and comparison can never disagree.
import type { AlertItem, ParameterReading, Parameter, Pond, PondStatus, ParameterStatus } from '@/types';
import { PARAMETERS } from '@/types';
import { parameterStatus, pondStatus } from './status';

export interface PondSummary {
  pond: Pond;
  status: PondStatus;
  parameters: Record<Parameter, { status: ParameterStatus; reading: ParameterReading }>;
  openAlerts: AlertItem[];
}

export function summarizePond(pond: Pond, readings: ParameterReading[], alerts: AlertItem[], asOf: string): PondSummary {
  const byParam = Object.fromEntries(PARAMETERS.map((p) => [p, readings.find((r) => r.parameter === p) ?? unavailable(p)])) as Record<Parameter, ParameterReading>;
  const parameters = Object.fromEntries(PARAMETERS.map((p) => [p, { status: parameterStatus(byParam[p], asOf), reading: byParam[p] }])) as PondSummary['parameters'];
  const statuses = PARAMETERS.map((p) => parameters[p].status);
  return {
    pond,
    status: pondStatus(statuses),
    parameters,
    openAlerts: alerts.filter((a) => a.pondId === pond.id && a.status !== 'RESOLVED'),
  };
}

/** A parameter with no sensor data at all (e.g. a newly created pond). */
export function unavailable(parameter: Parameter): ParameterReading {
  return { parameter, sensor: 'unavailable', latest: null, lastSeenAt: null, series: [] };
}

export interface FleetCounts { total: number; healthy: number; warning: number; critical: number; incomplete: number; noData: number }

/** Counts used by the dashboard. Every pond falls in exactly one bucket, so the buckets always add up to the total. */
export function fleetCounts(summaries: PondSummary[]): FleetCounts {
  const c: FleetCounts = { total: summaries.length, healthy: 0, warning: 0, critical: 0, incomplete: 0, noData: 0 };
  for (const s of summaries) {
    if (s.status === 'NORMAL') c.healthy++;
    else if (s.status === 'WARNING') c.warning++;
    else if (s.status === 'CRITICAL') c.critical++;
    else if (s.status === 'INCOMPLETE') c.incomplete++;
    else c.noData++;
  }
  return c;
}
