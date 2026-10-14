// Turns the synchronised pond state into the shapes the screens already consume (Pond, ParameterReading). Pure derivation: no value is
// created here. A parameter the backend has no reading for is "unavailable", never zero and never healthy.
import type { ChemistryReading, ParameterReading, Pond } from '@/types';
import { CHEMISTRY_PARAMETERS, PARAMETERS } from '@/types';
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

/** Ammonia, nitrate and turbidity as the backend reports them. A parameter with no reading has `latest: null` (never zero). */
export function chemistryFor(state: PondsState, pond: Pond): ChemistryReading[] {
  const snap = state.snapshots[pond.id];
  const series = state.history[pond.id];
  return CHEMISTRY_PARAMETERS.map((parameter) => {
    const p = snap?.parameters[parameter];
    return { parameter, latest: p ? { value: p.value, recordedAt: p.recordedAt } : null, source: p?.source ?? null, series: series?.[parameter] ?? [] };
  });
}

export function allChemistry(state: PondsState): Record<string, ChemistryReading[]> {
  return Object.fromEntries(state.ponds.map((p) => [p.id, chemistryFor(state, p)]));
}
