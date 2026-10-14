import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, WarningCircle, Binoculars } from '@phosphor-icons/react/dist/ssr';
import { serverApi } from '@/lib/api/client';
import { fleetStats, loadFleet, sortRows } from '@/lib/fleet';
import { formatAge, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Notice } from '@/components/ui/states';
import { linkButtonClass } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shell/RefreshButton';
import { PondCard } from '@/components/features/PondCard';
import { AlertFeed } from '@/components/features/AlertFeed';
import { AlertCardList } from '@/components/features/AlertCard';
import { FarmTwin } from '@/components/farm/FarmTwin';
import { demoFarm } from '@/lib/farmDemo';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const Section = ({ id, title, hint, action, children }: { id: string; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 id={id} className="text-lg font-medium tracking-tight text-ink">{title}</h2>{hint ? <p className="mt-0.5 text-[13px] text-ink-soft">{hint}</p> : null}</div>
      {action}
    </div>
    {children}
  </section>
);

/** Is anything wrong? What? How serious? Could it get worse? Everything else on this page supports those four questions. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ twin?: string | string[] }> }) {
  const { twin } = await searchParams;
  const demoTwin = (Array.isArray(twin) ? twin[0] : twin) === 'demo';
  const api = serverApi();
  const [fleetR, alertsR] = await Promise.allSettled([loadFleet(api), api.alerts({ status: 'OPEN', limit: 200 })]);
  const header = (right?: React.ReactNode) => <PageHeader title="Overview" description="How your ponds are doing right now." actions={right} />;
  if (fleetR.status === 'rejected') return (<>{header()}<Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);

  const { rows } = fleetR.value;
  const stats = fleetStats(rows);
  const open = alertsR.status === 'fulfilled' ? alertsR.value.items : null;
  const names = Object.fromEntries(rows.map((r) => [r.pond.id, r.pond.name]));
  const bySeverity = (a: { severity: string; status: string }, b: { severity: string; status: string }) => (a.severity === b.severity ? (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1) : a.severity === 'CRITICAL' ? -1 : 1);
  const current = (open ?? []).filter((a) => a.origin === 'observed').sort(bySeverity);
  // A forecast that only repeats a problem already happening (same pond and factor, same or worse) is not news: it stays in the Alerts list.
  const covered = new Set(current.map((a) => `${a.pondId}:${a.parameter}:${a.severity === 'CRITICAL' ? 2 : 1}`));
  const upcoming = (open ?? []).filter((a) => a.origin === 'predicted' && !covered.has(`${a.pondId}:${a.parameter}:${a.severity === 'CRITICAL' ? 2 : 1}`) && !(a.severity === 'WARNING' && covered.has(`${a.pondId}:${a.parameter}:2`))).sort(bySeverity);
  const attentionPonds = new Set(current.map((a) => a.pondId)).size;
  const quiet = stats.stale + stats.noData;
  const ordered = sortRows(rows);

  const headline = !stats.total ? 'No ponds yet'
    : stats.critical > 0 ? `${stats.critical} ${stats.critical === 1 ? 'pond is' : 'ponds are'} in a critical condition`
    : stats.warning > 0 ? `${stats.warning} ${stats.warning === 1 ? 'pond needs' : 'ponds need'} attention`
    : stats.healthy === stats.total ? (stats.total === 1 ? 'Your pond is healthy' : `All ${stats.total} ponds are healthy`)
    : stats.healthy > 0 ? `${stats.healthy} of ${stats.total} ponds are healthy` : 'No recent readings from any pond';
  const bad = stats.critical + stats.warning > 0;
  const Icon = bad ? WarningCircle : CheckCircle;

  return (
    <>
      {header(<RefreshButton />)}
      <div className="space-y-8">
        {stats.failed > 0 ? <Notice tone="warning">{stats.failed} of {stats.total} ponds could not be loaded, so the figures below are incomplete.</Notice> : null}
        {alertsR.status === 'rejected' ? <Notice tone="warning">Current problems could not be loaded, so this page may not show every problem. Try refreshing.</Notice> : null}

        <section aria-label="Summary" className={bad ? (stats.critical > 0 ? 'rounded-xl border border-crit-text/40 bg-crit-bg p-5' : 'rounded-xl border border-warn-text/40 bg-warn-bg p-5') : 'rounded-xl border border-line bg-card p-5'}>
          <div className="flex items-start gap-3">
            <Icon size={28} weight="fill" className={stats.critical > 0 ? 'text-crit-text' : bad ? 'text-warn-text' : quiet === stats.total ? 'text-ink-soft' : 'text-ok-text'} aria-hidden="true" />
            <div>
              <p className="text-xl font-medium tracking-tight text-ink" data-testid="overview-headline">{headline}</p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {stats.total ? `${stats.healthy} healthy · ${stats.warning} need attention · ${stats.critical} critical${quiet ? ` · ${quiet} with no recent reading` : ''}` : 'Ponds appear here once they are registered or imported.'}
                {stats.latestAt ? <> · Latest reading {formatAge(stats.latestAgeMinutes)} <span className="text-ink-soft">({formatDateTime(stats.latestAt)})</span></> : null}
              </p>
            </div>
          </div>
        </section>

        {/* The farm view uses the very same pond data as everything else on this page; demo fixtures only on explicit request (?twin=demo). */}
        {rows.length || demoTwin ? (() => { const demo = demoTwin ? demoFarm() : null; return <FarmTwin rows={demo ? demo.rows : rows} alerts={demo ? demo.alerts : open ?? []} mode={demo ? 'demo' : 'live'} loadedAt={new Date().toISOString()} />; })() : null}

        <Section id="attention" title="Needs attention now" hint="Problems measured in your ponds right now, most serious first." action={current.length > 6 ? <Link href="/alerts" className={linkButtonClass('secondary', 'sm')}>See all {current.length}</Link> : undefined}>
          {open === null ? <p className="text-[13px] text-ink-soft">Current problems are unavailable.</p>
            : current.length === 0 ? (
              <p className="flex items-start gap-2 rounded-xl border border-line bg-card px-4 py-4 text-[13px] text-ink">
                <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-ok-text" aria-hidden="true" />
                <span><span className="font-medium">No current problems.</span> {quiet && !stats.healthy ? 'No pond has sent a recent reading, so conditions are not known.' : 'Every pond with a recent reading is within the acceptable range.'}</span>
              </p>
            ) : <AlertFeed alerts={current.slice(0, 6)} pondNames={names} showGuidance />}
          {attentionPonds > 1 ? <p className="text-xs text-ink-soft">{attentionPonds} ponds affected.</p> : null}
        </Section>

        <Section id="upcoming" title="Possible upcoming problems" hint="Forecasts, not measurements. They may not happen.">
          {open === null ? <p className="text-[13px] text-ink-soft">Forecast warnings are unavailable.</p>
            : upcoming.length === 0 ? <p className="flex items-center gap-2 text-[13px] text-ink-soft"><Binoculars size={16} aria-hidden="true" />No forecast warnings right now.</p>
            : <AlertCardList alerts={upcoming.slice(0, 4)} pondNames={names} />}
        </Section>

        <Section id="ponds" title="Your ponds" hint="Most serious first." action={<Link href="/ponds" className={linkButtonClass('secondary', 'sm')}>See all ponds</Link>}>
          {ordered.length ? <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Ponds">{ordered.slice(0, 9).map((r) => <li key={r.pond.id}><PondCard row={r} /></li>)}</ul>
            : <Card><EmptyState title="No ponds yet">Ponds appear here once they are registered or imported.</EmptyState></Card>}
          {ordered.length > 9 ? <p className="text-xs text-ink-soft">Showing 9 of {ordered.length} ponds.</p> : null}
        </Section>
      </div>
    </>
  );
}
