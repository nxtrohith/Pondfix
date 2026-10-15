'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { CloudSlash, Plugs, Broadcast, ArrowsClockwise, WifiSlash } from '@phosphor-icons/react/dist/ssr';
import { connectionState, type ConnectionState } from '@/lib/care';
import { useT } from '@/i18n/client';
import { useRefresh } from './RefreshContext';
import { cx } from '../ui/cx';

const subscribe = (cb: () => void) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; };
/** The browser's own network report. On the server we assume online, so nothing claims "No internet" without evidence. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

export function useConnection(): ConnectionState {
  const { liveStatus, failures } = useRefresh();
  return connectionState({ online: useOnline(), live: liveStatus, failures });
}

const LOOK: Record<ConnectionState, { Icon: typeof Broadcast; cls: string; spin?: boolean }> = {
  connected: { Icon: Broadcast, cls: 'text-ok-text' },
  connecting: { Icon: ArrowsClockwise, cls: 'text-ink-soft', spin: true },
  reconnecting: { Icon: ArrowsClockwise, cls: 'text-warn-text', spin: true },
  noInternet: { Icon: WifiSlash, cls: 'text-crit-text' },
  serviceDown: { Icon: CloudSlash, cls: 'text-crit-text' },
};

/** Compact: icon + one word, linking to Help (troubleshooting). Full: title and explanation, for banners. */
export function ConnectionPill({ full, className }: { full?: boolean; className?: string }) {
  const state = useConnection();
  const t = useT();
  const { Icon, cls, spin } = LOOK[state];
  const title = t(`care.connection.${state}.title` as never);
  const body = t(`care.connection.${state}.body` as never);
  if (full) {
    if (state === 'connected') return null;
    return (
      <div role="status" className={cx('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', state === 'noInternet' || state === 'serviceDown' ? 'border-crit-line bg-crit-bg text-crit-text' : 'border-warn-line bg-warn-bg text-warn-text', className)}>
        <Icon size={18} aria-hidden="true" className={cx('mt-0.5 shrink-0', spin && 'animate-spin motion-reduce:animate-none')} />
        <p><span className="font-semibold">{title}.</span> <span className="text-ink">{body}</span> <Link href="/help#troubleshoot" className="font-medium underline underline-offset-2">{t('care.connection.help')}</Link></p>
      </div>
    );
  }
  return (
    <Link href="/help#troubleshoot" role="status" aria-label={`${title}. ${body}`} title={body} className={cx('flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-surface', cls, className)}>
      <Icon size={18} aria-hidden="true" className={cx(spin && 'animate-spin motion-reduce:animate-none')} />
      <span className="hidden sm:inline">{title}</span>
    </Link>
  );
}
