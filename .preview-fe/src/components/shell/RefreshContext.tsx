'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { PUBLIC_API_BASE_URL } from '@/lib/env';

export type LiveStatus = 'connecting' | 'live' | 'offline';
interface Ctx { refreshKey: number; refresh: () => void; refreshing: boolean; liveStatus: LiveStatus }
const RefreshCtx = createContext<Ctx>({ refreshKey: 0, refresh: () => {}, refreshing: false, liveStatus: 'connecting' });

const LIVE_EVENTS = ['pond:reading_updated', 'pond:updated', 'pond:forecast_updated', 'alert:new', 'alert:updated', 'alert:resolved'];
const LIVE_DEBOUNCE_MS = 1500; // the simulator posts one reading per pond, so a burst of events becomes one refetch
const API_ORIGIN = new URL(PUBLIC_API_BASE_URL).origin;

/** One refresh action: re-renders server data and bumps a key that client-fetching components depend on. Also refreshes by itself when the backend pushes a reading or alert. */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [key, setKey] = useState(0);
  const [pending, start] = useTransition();
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
  const refresh = useCallback(() => { setKey((k) => k + 1); start(() => router.refresh()); }, [router]);

  useEffect(() => {
    const socket = io(API_ORIGIN, { transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Silent: no spinner, and the old data stays visible until the new data arrives.
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { setKey((k) => k + 1); router.refresh(); }, LIVE_DEBOUNCE_MS); };
    socket.on('connect', () => { setLiveStatus('live'); soon(); }); // events sent while offline are not replayed, so refetch on every (re)connect
    socket.on('disconnect', () => setLiveStatus('offline'));
    socket.on('connect_error', () => setLiveStatus('offline'));
    LIVE_EVENTS.forEach((e) => socket.on(e, soon));
    return () => { clearTimeout(timer); socket.disconnect(); };
  }, [router]);

  const value = useMemo(() => ({ refreshKey: key, refresh, refreshing: pending, liveStatus }), [key, refresh, pending, liveStatus]);
  return <RefreshCtx.Provider value={value}>{children}</RefreshCtx.Provider>;
}
export const useRefresh = () => useContext(RefreshCtx);
