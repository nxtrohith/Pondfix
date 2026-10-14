'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Drop, List, X, Bell, ArrowsClockwise, MagnifyingGlass, CheckCircle, WarningCircle, Plugs } from '@phosphor-icons/react/dist/ssr';
import { NAV_GROUPS, SYSTEM_PAGE, isActive, pageTitle } from '@/lib/nav';
import { cx } from '@/components/ui/cx';
import { RefreshProvider, useRefresh } from './RefreshContext';

export type SystemState = 'ok' | 'degraded' | 'down' | 'unreachable';
interface ShellProps { children: ReactNode; openAlerts: number | null; openAlertsMore: boolean; system: SystemState }

const SYSTEM: Record<SystemState, { label: string; cls: string; Icon: typeof CheckCircle }> = {
  ok: { label: 'System status: OK', cls: 'text-ink-soft', Icon: CheckCircle },
  degraded: { label: 'System status: degraded', cls: 'text-warn-text', Icon: WarningCircle },
  down: { label: 'System status: problem', cls: 'text-crit-text', Icon: WarningCircle },
  unreachable: { label: 'System status: offline', cls: 'text-crit-text', Icon: Plugs },
};

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="AquaGuard overview">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-olive text-white" aria-hidden="true"><Drop size={18} weight="fill" /></span>
      <span className={cx('text-[17px] font-medium tracking-tight text-ink', compact && 'md:hidden lg:inline')}>AquaGuard</span>
    </Link>
  );
}

function NavLinks({ pathname, onNavigate, rail }: { pathname: string; onNavigate?: () => void; rail?: boolean }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.label ? <p className={cx('px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-soft', rail && 'md:sr-only lg:not-sr-only')}>{group.label}</p> : null}
          {group.items.map(({ href, label, icon: IconCmp }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={cx(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
                  rail && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
                  active ? 'bg-sage-pale text-olive-text' : 'text-ink-soft hover:bg-surface hover:text-ink',
                )}
              >
                <IconCmp size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" className="shrink-0" />
                <span className={cx(rail && 'md:sr-only lg:not-sr-only')}>{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SystemStatus({ system, rail }: { system: SystemState; rail?: boolean }) {
  const s = SYSTEM[system];
  const pathname = usePathname();
  return (
    <Link href={SYSTEM_PAGE.href} title={s.label} aria-current={isActive(pathname, SYSTEM_PAGE.href) ? 'page' : undefined} className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-surface', rail && 'md:justify-center md:px-0 lg:justify-start lg:px-3', s.cls)}>
      <s.Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className={cx(rail && 'md:sr-only lg:not-sr-only')}>{s.label}</span>
    </Link>
  );
}

function Topbar({ openAlerts, openAlertsMore, onMenu }: { openAlerts: number | null; openAlertsMore: boolean; onMenu: () => void }) {
  const pathname = usePathname();
  const { title, parent } = pageTitle(pathname);
  const { refresh, refreshing } = useRefresh();
  const countLabel = openAlerts === null ? 'Alert count unavailable' : `${openAlerts}${openAlertsMore ? '+' : ''} open alerts`;
  return (
    <header className="sticky top-0 z-[var(--z-nav)] flex h-14 items-center gap-3 border-b border-line bg-page/95 px-4 backdrop-blur-none md:px-6 lg:px-8">
      <button type="button" onClick={onMenu} aria-label="Open navigation menu" className="-ml-1 flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface md:hidden">
        <List size={22} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {parent ? (<><Link href={parent.href} className="hidden text-ink-soft hover:text-ink sm:inline">{parent.label}</Link><span className="hidden text-ink-soft sm:inline" aria-hidden="true">/</span></>) : null}
        <span className="truncate font-medium text-ink">{title}</span>
      </div>
      <form action="/ponds" method="get" role="search" className="ml-auto hidden w-full max-w-xs items-center sm:flex">
        <label htmlFor="global-pond-search" className="sr-only">Search ponds</label>
        <div className="relative w-full">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <input id="global-pond-search" name="q" type="search" placeholder="Search ponds" autoComplete="off" className="h-9 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft focus-visible:border-olive" />
        </div>
      </form>
      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <Link href="/ponds" aria-label="Search ponds" className="flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface sm:hidden"><MagnifyingGlass size={20} aria-hidden="true" /></Link>
        <button type="button" onClick={refresh} aria-label="Refresh data" title="Refresh data" className="flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink active:translate-y-px">
          <ArrowsClockwise size={20} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
        </button>
        <Link href="/alerts" aria-label={countLabel} title={countLabel} className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink">
          <Bell size={20} aria-hidden="true" />
          {openAlerts ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-crit-text px-1 text-[11px] font-medium leading-none text-white" aria-hidden="true">{openAlerts > 99 ? '99+' : openAlerts}{openAlertsMore && openAlerts <= 99 ? '+' : ''}</span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}

export function AppShell({ children, openAlerts, openAlertsMore, system }: ShellProps) {
  const pathname = usePathname();
  // The drawer is open only for the page it was opened on, so navigating closes it without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPath(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <RefreshProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-dialog)] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-sm">Skip to content</a>
      <div className="min-h-[100dvh] md:grid md:grid-cols-[68px_minmax(0,1fr)] lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-[100dvh] flex-col border-r border-line bg-sidebar px-3 py-5 md:flex" aria-label="Sidebar">
          <div className="px-1 md:flex md:justify-center lg:block lg:px-2"><Brand compact /></div>
          <div className="mt-8 flex-1"><NavLinks pathname={pathname} rail /></div>
          <SystemStatus system={system} rail />
        </aside>

        {open ? (
          <div className="fixed inset-0 z-[var(--z-drawer)] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} tabIndex={-1} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-sidebar px-3 py-5">
              <div className="flex items-center justify-between px-2"><Brand />
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close navigation menu" className="flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface"><X size={20} aria-hidden="true" /></button>
              </div>
              <div className="mt-8 flex-1"><NavLinks pathname={pathname} onNavigate={() => setOpen(false)} /></div>
              <SystemStatus system={system} />
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <Topbar openAlerts={openAlerts} openAlertsMore={openAlertsMore} onMenu={() => setOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </RefreshProvider>
  );
}
