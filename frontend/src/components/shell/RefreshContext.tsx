'use client';
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface Ctx { refreshKey: number; refresh: () => void; refreshing: boolean }
const RefreshCtx = createContext<Ctx>({ refreshKey: 0, refresh: () => {}, refreshing: false });

/** One refresh action: re-renders server data and bumps a key that client-fetching components depend on. */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [key, setKey] = useState(0);
  const [pending, start] = useTransition();
  const refresh = useCallback(() => { setKey((k) => k + 1); start(() => router.refresh()); }, [router]);
  const value = useMemo(() => ({ refreshKey: key, refresh, refreshing: pending }), [key, refresh, pending]);
  return <RefreshCtx.Provider value={value}>{children}</RefreshCtx.Provider>;
}
export const useRefresh = () => useContext(RefreshCtx);
