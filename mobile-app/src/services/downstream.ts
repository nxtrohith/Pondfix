// Rule-of-thumb knock-on effects for one pond (backend/src/services/downstream.js). Information only: they never raise an alert and are
// not part of the pond status.
import type { DownstreamRisk } from '@/types';
import { apiGet } from './api';
import { normalizeRisks } from './alerts';

export async function getDownstreamRisks(pondId: string): Promise<DownstreamRisk[]> {
  const body = await apiGet<unknown>(`/ponds/${encodeURIComponent(pondId)}/downstream-risks`);
  return normalizeRisks(typeof body === 'object' && body !== null ? (body as { risks?: unknown }).risks : null);
}
