// Turns the synchronised pond state into the shapes the screens already consume (Pond, ParameterReading). Pure derivation: no value is
// created here. A parameter the backend has no reading for is "unavailable", never zero and never healthy.
import type { ParameterReading, Pond } from '@/types';
import { PARAMETERS } from '@/types';
import type { PondsState } from './pondState';
import { unavailable } from './pondSummary';

export function readingsFor(state: PondsState, pond: Pond): ParameterReading[] {
  const snap = state.snapshots[pond.id];
  const series = state.history[pond.id];
  return PARAMETERS.map((parameter) => {
    const p = snap?.parameters[parameter];
    if (!p) return unavailable(parameter);
    return {
      parameter, sensor: 'online' as const, latest: { value: p.value, recordedAt: p.recordedAt }, lastSeenAt: p.recordedAt,
      series: series?.[parameter] ?? [], risk: p.risk, staleAfterMinutes: snap.staleAfterMinutes, source: p.source,
    };
  });
}

export function allReadings(state: PondsState): Record<string, ParameterReading[]> {
  return Object.fromEntries(state.ponds.map((p) => [p.id, readingsFor(state, p)]));
}
