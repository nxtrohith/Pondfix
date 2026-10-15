'use client';
import { useCallback, useEffect, useEffectEvent, useState, type DependencyList } from 'react';
import { ApiError } from './api/client';
import { useRefresh } from '@/components/shell/RefreshContext';

export interface QueryState<T> { data: T | null; error: unknown; loading: boolean; reload: () => void }
interface Settled<T> { identity: string; version: string; data: T | null; error: unknown }

/**
 * Runs `fetcher` when `deps` change (a new "identity"), when the global Refresh is pressed, or on `reload()` (a new "version").
 * - The previous request is aborted, so a slow response for an old selection can never overwrite the current one.
 * - Data from a different identity is never shown (no stale pond under a new pond's heading); on a plain refresh
 *   the existing data stays visible while loading.
 * - `enabled: false` skips the request.
 * `deps` must hold primitives (ids, strings, numbers).
 */
export function useApiQuery<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList, enabled = true): QueryState<T> {
  const { refreshKey } = useRefresh();
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const identity = JSON.stringify(deps);
  const version = `${refreshKey}:${tick}`;
  const run = useEffectEvent((signal: AbortSignal) => fetcher(signal));

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    run(ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setSettled({ identity, version, data, error: null }); },
      (error) => { if (ctrl.signal.aborted || (error instanceof ApiError && error.kind === 'aborted')) return; setSettled({ identity, version, data: null, error }); },
    );
    return () => ctrl.abort();
  }, [identity, version, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  if (!enabled) return { data: null, error: null, loading: false, reload };
  const sameIdentity = settled?.identity === identity;
  const current = sameIdentity && settled?.version === version;
  return { data: sameIdentity ? settled.data : null, error: current ? settled.error : null, loading: !current, reload };
}
