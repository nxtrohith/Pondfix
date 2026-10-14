'use client';
import { useMemo } from 'react';
import { browserApi } from './api/client';
import { useApiQuery } from './useApiQuery';

/**
 * Which database the API is using, from GET /api/health. Every write-capable simulation control requires `canWrite`:
 * the database must be reported up AND local, so simulated data can never reach a remote database from this UI.
 */
export function useDbTarget() {
  const api = useMemo(() => browserApi(), []);
  const q = useApiQuery((s) => api.health(s), []);
  const target = q.data?.database.target ?? 'unknown';
  return { target, canWrite: target === 'local' && q.data?.database.status === 'up', loading: q.loading && !q.data, error: q.error, reload: q.reload };
}
