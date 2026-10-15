import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, Binoculars, Flask } from '@phosphor-icons/react/dist/ssr';
import { serverApi } from '@/lib/api/client';
import { fleetStats, loadFleet, sortRows } from '@/lib/fleet';
import { summarizeOverview } from '@/lib/overview';
import { PARAMETER_URGENCY, farmVerdict } from '@/lib/care';
import { getT } from '@/i18n/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Notice } from '@/components/ui/states';
import { linkButtonClass } from '@/components/ui/Button';
import { WelcomeCard } from '@/components/features/WelcomeCard';
import { PondCard } from '@/components/features/PondCard';
import { AlertFeed } from '@/components/features/AlertFeed';
import { AlertCardList } from '@/components/features/AlertCard';
import { PondStatusHero } from '@/components/features/PondStatusHero';
import { FarmTwin } from '@/components/farm/FarmTwin';
import { demoFarm } from '@/lib/farmDemo';

export const metadata: Metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

const Section = ({ id, title, hint, action, children }: { id: string; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 id={id} className="text-xl font-semibold tracking-tight text-ink">{title}</h2>{hint ? <p className="mt-0.5 text-sm text-ink-soft">{hint}</p> : null}</div>
      {action}
    </div>
    {children}
  </section>
);

/**
 * Home answers four questions, in this order: Is my pond safe? Is anything wrong? What do I do? How old is the data?
 * Everything else (other problems, forecasts, the pond list, the farm map) comes after, for when there is time.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ twin?: string | string[] }> }) {
  const { twin } = await searchParams;
  const demoTwin = (Array.isArray(twin) ? twin[0] : twin) === 'demo';
  const t = await getT();
  const api = serverApi();
  const [fleetR, alertsR] = await Promise.allSettled([loadFleet(api), api.alerts({ status: 'OPEN', limit: 200 })]);
  const header = () => <PageHeader title={t('home.title')} description={t('home.description')} />;
  if (fleetR.status === 'rejected') return (<>{header()}<Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);

  const { rows } = fleetR.value;
  const stats = fleetStats(rows);
  const open = alertsR.status === 'fulfilled' ? alertsR.value.items : null;
  const names = Object.fromEntries(rows.map((r) => [r.pond.id, r.pond.name]));
  // Most serious first; between equally serious problems, oxygen first (it can kill fish within hours), then the newest.
  const rank = (p: string) => PARAMETER_URGENCY[p] ?? 9;
  type Sortable = { severity: string; status: string; createdAt: string; parameter: string };
  const bySeverity = (a: Sortable, b: Sortable) => (a.severity !== b.severity ? (a.severity === 'CRITICAL' ? -1 : 1) : rank(a.parameter) - rank(b.parameter) || (a.status === b.status ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.status === 'ACTIVE' ? -1 : 1));
  const current = (open ?? []).filter((a) => a.origin === 'observed').sort(bySeverity);
  // A forecast that only repeats a problem already happening (same pond and factor, same or worse) is not news: it stays in the Alerts list.
  const covered = new Set(current.map((a) => `${a.pondId}:${a.parameter}:${a.severity === 'CRITICAL' ? 2 : 1}`));
  const upcoming = (open ?? []).filter((a) => a.origin === 'predicted' && !covered.has(`${a.pondId}:${a.parameter}:${a.severity === 'CRITICAL' ? 2 : 1}`) && !(a.severity === 'WARNING' && covered.has(`${a.pondId}:${a.parameter}:2`))).sort(bySeverity);
  const ordered = sortRows(rows);

  const summary = summarizeOverview(stats, current);
  const verdict = farmVerdict(stats, current);
  const top = current[0] ? { ...current[0], pondName: names[current[0].pondId] ?? 'Pond' } : null;
  const unknown = stats.stale + stats.noData + stats.unknown + stats.failed;
  const rest = current.slice(1);

  return (
    <>
      <h1 className="sr-only">{t('home.title')}</h1>
      <div className="space-y-8">
        {stats.failed > 0 ? <Notice tone="warning">{stats.failed} of {stats.total} ponds could not be loaded, so the figures below are incomplete.</Notice> : null}
        {alertsR.status === 'rejected' ? <Notice tone="warning">Current problems could not be loaded, so this page may not show every problem. Try refreshing.</Notice> : null}

        <PondStatusHero
          verdict={verdict}
          headline={summary.headline.replace(' (test data)', '')}
          counts={{ urgent: stats.critical, attention: stats.warning, healthy: stats.healthy, unknown, total: stats.total }}
          latestAt={stats.latestAt}
          latestAgeMinutes={stats.latestAgeMinutes}
          top={top}
          testData={summary.testData}
        />

        {unknown === stats.total && stats.total > 0 && !top ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            Want to see how an alert looks without any risk?
            <Link href="/simulation" className={linkButtonClass('secondary', 'sm')}><Flask size={16} aria-hidden="true" />{t('home.tryDemo')}</Link>
          </p>
        ) : null}

        <WelcomeCard />

        <Section id="attention" title={t('home.needsAttention')} hint={t('home.needsAttentionHint')} action={current.length > 6 ? <Link href="/alerts" className={linkButtonClass('secondary', 'sm')}>{t('home.allProblems', { count: current.length })}</Link> : undefined}>
          {open === null ? <p className="text-sm text-ink-soft">Current problems are unavailable.</p>
            : current.length === 0 ? (
              <p className="flex items-start gap-2 rounded-xl border border-line bg-card px-4 py-4 text-[15px] text-ink">
                <CheckCircle size={20} weight="fill" className="mt-px shrink-0 text-ok-text" aria-hidden="true" />
                <span>{unknown > 0 ? t('home.noProblemsUnknown') : t('home.noProblems')}</span>
              </p>
            ) : rest.length === 0 ? <p className="text-sm text-ink-soft">The only measured problem is shown above.</p>
            : <AlertFeed alerts={rest.slice(0, 6)} pondNames={names} showGuidance stepsLimit={1} />}
        </Section>

        <Section id="ponds" title={t('home.yourPonds')} hint={t('home.yourPondsHint')} action={<Link href="/ponds" className={linkButtonClass('secondary', 'sm')}>{t('home.seeAllPonds')}</Link>}>
          {ordered.length ? <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Ponds">{ordered.slice(0, 6).map((r) => <li key={r.pond.id}><PondCard row={r} /></li>)}</ul>
            : <Card><EmptyState title="No ponds yet">Ponds appear here once they are registered or imported.</EmptyState></Card>}
          {ordered.length > 6 ? <p className="text-sm text-ink-soft">Showing 6 of {ordered.length} ponds. <Link href="/ponds" className="font-medium text-brand-text underline underline-offset-2">{t('home.seeAllPonds')}</Link></p> : null}
        </Section>

        <Section id="upcoming" title={t('home.upcoming')} hint={t('home.upcomingHint')}>
          {open === null ? <p className="text-sm text-ink-soft">Forecast warnings are unavailable.</p>
            : upcoming.length === 0 ? <p className="flex items-center gap-2 text-sm text-ink-soft"><Binoculars size={18} aria-hidden="true" />{t('home.noUpcoming')}</p>
            : <AlertCardList alerts={upcoming.slice(0, 4)} pondNames={names} />}
        </Section>

        {/* The farm view uses the very same pond data as everything else on this page; demo fixtures only on explicit request (?twin=demo). */}
        {rows.length || demoTwin ? (() => { const demo = demoTwin ? demoFarm() : null; return <FarmTwin rows={demo ? demo.rows : rows} alerts={demo ? demo.alerts : open ?? []} mode={demo ? 'demo' : 'live'} loadedAt={new Date().toISOString()} />; })() : null}
      </div>
    </>
  );
}
