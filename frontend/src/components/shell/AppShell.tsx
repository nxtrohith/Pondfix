'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Drop, List, X, Bell, ChatCircleText, ArrowsClockwise, MagnifyingGlass, CheckCircle, WarningCircle, Plugs } from '@phosphor-icons/react/dist/ssr';
import { NAV_GROUPS, PRIMARY_NAV, SECONDARY_NAV, SYSTEM_PAGE, isActive, pageTitle, type NavItem } from '@/lib/nav';
import { useT } from '@/i18n/client';
import { cx } from '@/components/ui/cx';
import { RefreshProvider, useRefresh } from './RefreshContext';
import { ConnectionPill } from './ConnectionPill';
import { LanguageSelect } from './LanguageSelect';

export type SystemState = 'ok' | 'degraded' | 'down' | 'unreachable';
interface ShellProps { children: ReactNode; openAlerts: number | null; openAlertsMore: boolean; system: SystemState }

/** What the web server could see of the PondFix service when it rendered this page (not the browser's own connection). */
const SYSTEM: Record<SystemState, { label: string; cls: string; Icon: typeof CheckCircle }> = {
  ok: { label: 'Service working', cls: 'text-ink-soft', Icon: CheckCircle },
  degraded: { label: 'Service partly working', cls: 'text-warn-text', Icon: WarningCircle },
  down: { label: 'Service problem', cls: 'text-crit-text', Icon: WarningCircle },
  unreachable: { label: 'Service unreachable', cls: 'text-crit-text', Icon: Plugs },
};

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="PondFix home">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white" aria-hidden="true"><Drop size={20} weight="fill" /></span>
      <span className={cx('text-lg font-semibold tracking-tight text-ink', compact && 'md:hidden lg:inline')}>PondFix</span>
    </Link>
  );
}

function NavLink({ item, pathname, onNavigate, rail }: { item: NavItem; pathname: string; onNavigate?: () => void; rail?: boolean }) {
  const t = useT();
  const active = isActive(pathname, item.href);
  const label = t(item.labelKey);
  const IconCmp = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cx(
        'relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors duration-150',
        rail && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
        active ? 'bg-brand-pale text-brand-text before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-brand' : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      <IconCmp size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" className="shrink-0" />
      <span className={cx(rail && 'md:sr-only lg:not-sr-only')}>{label}</span>
    </Link>
  );
}

function SideNav({ pathname, onNavigate, rail, groups = NAV_GROUPS }: { pathname: string; onNavigate?: () => void; rail?: boolean; groups?: typeof NAV_GROUPS }) {
  const t = useT();
  return (
    <nav aria-label={t('nav.main')} className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.labelKey ? <p className={cx('px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft', rail && 'md:sr-only lg:not-sr-only')}>{t(group.labelKey)}</p> : null}
          {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} rail={rail} />)}
        </div>
      ))}
    </nav>
  );
}

function SystemStatus({ system, rail }: { system: SystemState; rail?: boolean }) {
  const s = SYSTEM[system];
  const pathname = usePathname();
  return (
    <Link href={SYSTEM_PAGE.href} title={s.label} aria-current={isActive(pathname, SYSTEM_PAGE.href) ? 'page' : undefined} className={cx('flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface', rail && 'md:justify-center md:px-0 lg:justify-start lg:px-3', s.cls)}>
      <s.Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className={cx(rail && 'md:sr-only lg:not-sr-only')}>{s.label}</span>
    </Link>
  );
}

const iconBtn = 'flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink pointer-coarse:size-11';

function Topbar({ openAlerts, openAlertsMore, onMenu }: { openAlerts: number | null; openAlertsMore: boolean; onMenu: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const { titleKey, parent } = pageTitle(pathname);
  const { refresh, refreshing } = useRefresh();
  const count = openAlerts === null ? null : `${openAlerts}${openAlertsMore ? '+' : ''}`;
  const countLabel = count === null ? t('nav.alertCountUnknown') : t('nav.alertCount', { count });
  return (
    <header className="sticky top-0 z-[var(--z-nav)] flex h-16 items-center gap-2 border-b border-line bg-page/95 px-3 backdrop-blur-sm md:px-6 lg:px-8">
      <div className="md:hidden"><Brand /></div>
      <div className="hidden min-w-0 items-center gap-2 text-[15px] md:flex">
        {parent ? (<><Link href={parent.href} className="text-ink-soft hover:text-ink">{t(parent.labelKey)}</Link><span className="text-ink-soft" aria-hidden="true">/</span></>) : null}
        <span className="truncate font-medium text-ink">{t(titleKey)}</span>
      </div>
      <form action="/ponds" method="get" role="search" className="ml-auto hidden w-full max-w-xs items-center lg:flex">
        <label htmlFor="global-pond-search" className="sr-only">{t('nav.searchPonds')}</label>
        <div className="relative w-full">
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <input id="global-pond-search" name="q" type="search" placeholder={t('nav.searchPonds')} autoComplete="off" className="h-10 w-full rounded-lg border border-line bg-card pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft focus-visible:border-brand" />
        </div>
      </form>
      <div className="ml-auto flex items-center gap-1 lg:ml-0">
        <ConnectionPill />
        <LanguageSelect className="hidden sm:flex" />
        <button type="button" onClick={refresh} aria-label={t('nav.refresh')} title={t('nav.refresh')} className={cx(iconBtn, 'active:translate-y-px')}>
          <ArrowsClockwise size={22} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
        </button>
        <Link href="/alerts" aria-label={countLabel} title={countLabel} className={cx(iconBtn, 'relative')}>
          <Bell size={22} aria-hidden="true" />
          {openAlerts ? (
            <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-crit-text px-1 text-xs font-semibold leading-none text-white" aria-hidden="true">{openAlerts > 99 ? '99+' : count}</span>
          ) : null}
        </Link>
        <button type="button" onClick={onMenu} aria-label={t('nav.openMenu')} className={cx(iconBtn, 'md:hidden')}>
          <List size={24} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** Phones: the five daily destinations stay one thumb-tap away. Icon AND word, with the current page marked by more than colour. */
function BottomNav({ pathname, openAlerts }: { pathname: string; openAlerts: number | null }) {
  const t = useT();
  return (
    <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const IconCmp = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? 'page' : undefined} aria-label={t(item.labelKey)} className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium', active ? 'text-brand-text' : 'text-ink-soft')}>
                <span className={cx('relative flex h-8 w-14 items-center justify-center rounded-full', active && 'bg-brand-pale')}>
                  <IconCmp size={24} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  {item.href === '/alerts' && openAlerts ? <span className="absolute -top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-crit-text px-1 text-[11px] font-semibold leading-none text-white" aria-hidden="true">{openAlerts > 99 ? '99+' : openAlerts}</span> : null}
                </span>
                <span className={cx('max-w-full truncate', active && 'font-semibold')}>{t(item.shortKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children, openAlerts, openAlertsMore, system }: ShellProps) {
  const pathname = usePathname();
  const t = useT();
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
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-dialog)] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-sm">{t('nav.skip')}</a>
      <div className="min-h-[100dvh] md:grid md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-[100dvh] flex-col overflow-y-auto border-r border-line bg-sidebar px-3 py-5 md:flex" aria-label="Sidebar">
          <div className="px-1 md:flex md:justify-center lg:block lg:px-2"><Brand compact /></div>
          <div className="mt-8 flex-1"><SideNav pathname={pathname} rail /></div>
          <SystemStatus system={system} rail />
        </aside>

        {open ? (
          <div className="fixed inset-0 z-[var(--z-drawer)] md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
            <button type="button" aria-label={t('nav.closeMenu')} className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} tabIndex={-1} />
            <div className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col overflow-y-auto border-l border-line bg-sidebar px-3 py-5">
              <div className="flex items-center justify-between px-2"><span className="text-lg font-semibold text-ink">{t('nav.menu')}</span>
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t('nav.closeMenu')} className={iconBtn}><X size={22} aria-hidden="true" /></button>
              </div>
              <div className="mt-4 px-1"><LanguageSelect id="language-select-drawer" className="[&_select]:w-full" /></div>
              <div className="mt-6 flex-1"><SideNav pathname={pathname} onNavigate={() => setOpen(false)} groups={[{ labelKey: 'nav.more', items: SECONDARY_NAV }]} /></div>
              <SystemStatus system={system} />
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <Topbar openAlerts={openAlerts} openAlertsMore={openAlertsMore} onMenu={() => setOpen(true)} />
          <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-6 md:px-6 md:pb-10 lg:px-8 lg:pt-8">{children}</main>
        </div>
      </div>
      {isActive(pathname, '/chat') ? null : (
        <Link href="/chat" aria-label={t('nav.ask')} title={t('nav.ask')} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[var(--z-nav)] flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg md:hidden">
          <ChatCircleText size={26} weight="fill" aria-hidden="true" />
        </Link>
      )}
      <BottomNav pathname={pathname} openAlerts={openAlerts} />
    </RefreshProvider>
  );
}
