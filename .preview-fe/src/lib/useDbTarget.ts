'use client';
import { useMemo } from 'react';
import { browserApi } from './api/client';
import { useApiQuery } from './useApiQuery';

/**
 * Which database the API is using, from GET /api/health. Simulation and demo controls write simulated readings into the
 * Atlas database, so `canWrite` requires the database to be up on Atlas AND the API to have demo mode explicitly enabled
 * (DEMO_ENABLED=true, off by default).
 */
export function useDbTarget() {
  const api = useMemo(() => browserApi(), []);
  const q = useApiQuery((s) => api.health(s), []);
  const target = q.data?.database.target ?? 'unknown';
  return { target, canWrite: target === 'atlas' && q.data?.database.status === 'up' && q.data?.demo?.enabled === true, demo: q.data?.demo?.enabled ?? false, loading: q.loading && !q.data, error: q.error, reload: q.reload };
}
