import type { Metadata } from 'next';
import Link from 'next/link';
import { Drop, CheckCircle, WarningCircle, Bell, ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { serverApi } from '@/lib/api/client';
import { alertSeverityCounts, fleetStats, loadFleet, sortRows } from '@/lib/fleet';
import { fmtThreshold, formatAge, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState, ErrorState, Notice } from '@/components/ui/states';
import { linkButtonClass } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shell/RefreshButton';
import { DistributionBar } from '@/components/charts/DistributionBar';
import { MeasurementTrend, type TrendPond } from '@/components/features/MeasurementTrend';
import { PondTable } from '@/components/features/PondTable';
import { AlertList } from '@/components/features/AlertList';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const api = serverApi();
  const [fleetR, alertsR, rulesR] = await Promise.allSettled([loadFleet(api), api.alerts({ status: 'OPEN', limit: 200 }), api.riskRules()]);

  if (fleetR.status === 'rejected') {
    return (<><PageHeader title="Overview" description="Monitor pond health, water quality and forecasts." /><Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);
  }
  const { rows } = fleetR.value;
  const stats = fleetStats(rows);
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  const alerts = alertsR.status === 'fulfilled' ? alertsR.value : null;
  const sev = alerts ? alertSeverityCounts(alerts.items) : null;
  const names = Object.fromEntries(rows.map((r) => [r.pond.id, r.pond.name]));
  const staleAfter = rules?.staleAfterMinutes ?? 60;
  const freshnessStale = stats.latestAgeMinutes === null || stats.latestAgeMinutes > staleAfter;

  const trendPonds: TrendPond[] = rows.map((r) => ({ id: r.pond.id, name: r.pond.name, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }));
  const defaultPond = [...rows].filter((r) => r.latestAt).sort((a, b) => Date.parse(b.latestAt!) - Date.parse(a.latestAt!))[0] ?? rows[0];
  const tableRows = sortRows(rows).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Monitor pond health, water quality and forecasts."
        actions={(
          <>
            <div className="mr-1 flex items-center gap-2 text-[13px] text-ink-soft" aria-live="polite">
              <StatusPill tone={freshnessStale ? 'muted' : 'healthy'}>{stats.latestAt ? (freshnessStale ? 'Stale data' : 'Fresh data') : 'No data'}</StatusPill>
              <span>{stats.latestAt ? `Latest reading ${formatDateTime(stats.latestAt)} (${formatAge(stats.latestAgeMinutes)})` : 'No readings recorded yet'}</span>
            </div>
            <RefreshButton />
          </>
        )}
      />

      <div className="space-y-6">
        {stats.failed > 0 ? <Notice tone="warning">{stats.failed} of {stats.total} ponds could not be loaded, so the totals below are incomplete.</Notice> : null}
        {alertsR.status === 'rejected' ? <Notice tone="warning">Open alerts could not be loaded. Alert figures are unavailable.</Notice> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Drop} label="Total ponds" value={stats.total} context={stats.total ? `${stats.stale + stats.noData} with stale or no data` : 'No ponds registered'} />
          <KpiCard icon={CheckCircle} label="Healthy ponds" value={stats.healthy} context={rules ? `Dissolved oxygen at or above ${fmtThreshold(rules.dissolvedOxygen.warningBelow)} ${rules.dissolvedOxygen.unit}, fresh data` : 'Dissolved oxygen within limits, fresh data'} />
          <KpiCard icon={WarningCircle} label="Ponds requiring attention" value={stats.attention} context={`${stats.critical} critical, ${stats.warning} warning`} />
          <KpiCard icon={Bell} label="Unresolved alerts" value={alerts ? `${alerts.count}${alerts.nextCursor ? '+' : ''}` : 'n/a'} context={sev ? `${sev.critical} critical, ${sev.warning} warning, ${sev.acknowledged} acknowledged` : 'Alert data unavailable'} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {defaultPond ? <MeasurementTrend ponds={trendPonds} initialPondId={defaultPond.pond.id} rules={rules} title="Recent water-quality trend" /> : <Card><EmptyState title="No ponds yet">Ponds appear here once they are registered or imported.</EmptyState></Card>}
          <Card aria-labelledby="dist-title" className="self-start">
            <CardHeader id="dist-title" title="Pond health" description="Latest dissolved-oxygen status per pond" />
            <div className="px-5 pb-5 pt-4">
              {stats.total === 0 ? <EmptyState title="No ponds to summarise" /> : (
                <DistributionBar
                  total={stats.total}
                  unitLabel="ponds"
                  segments={[
                    { key: 'ok', label: 'Healthy', count: stats.healthy, bar: '#7D9274', text: '' },
                    { key: 'warn', label: 'Warning', count: stats.warning, bar: '#A66D25', text: '' },
                    { key: 'crit', label: 'Critical', count: stats.critical, bar: '#B64D43', text: '' },
                    { key: 'stale', label: 'Stale data', count: stats.stale, bar: '#B9B8AD', text: '' },
                    { key: 'nodata', label: 'No data', count: stats.noData + stats.unknown, bar: '#D8D6CB', text: '' },
                    ...(stats.failed ? [{ key: 'err', label: 'Could not load', count: stats.failed, bar: '#E5E3D9', text: '' }] : []),
                  ]}
                />
              )}
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[13px] font-medium text-ink">Unresolved alerts by severity</h3>
                {sev && alerts ? (
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[['Critical', sev.critical, 'text-crit-text'], ['Warning', sev.warning, 'text-warn-text'], ['Acknowledged', sev.acknowledged, 'text-olive-text']].map(([label, n, cls]) => (
                      <div key={String(label)} className="rounded-lg bg-surface px-2 py-2.5"><dd className={`text-xl font-medium tabular-nums ${cls}`}>{n}</dd><dt className="mt-0.5 text-[11px] text-ink-soft">{label}</dt></div>
                    ))}
                  </dl>
                ) : <p className="mt-2 text-xs text-ink-soft">Alert data unavailable.</p>}
                {alerts ? <p className="mt-2 text-xs text-ink-soft">{alerts.count}{alerts.nextCursor ? '+' : ''} unresolved. Acknowledged alerts are still unresolved.</p> : null}
              </div>
            </div>
          </Card>
        </div>

        <Card aria-labelledby="monitor-title">
          <CardHeader id="monitor-title" title="Pond monitoring" description="Ponds needing attention are listed first." action={<Link href="/ponds" className={linkButtonClass('secondary', 'sm')}>View all ponds <ArrowRight size={14} aria-hidden="true" /></Link>} />
          <div className="pt-3">
            {tableRows.length ? <PondTable rows={tableRows} caption="Pond monitoring summary" /> : <EmptyState title="No ponds yet">Ponds appear here once they are registered or imported.</EmptyState>}
          </div>
        </Card>

        <Card aria-labelledby="alerts-title">
          <CardHeader id="alerts-title" title="Recent alerts" description="Unresolved alerts, newest first." action={<Link href="/alerts" className={linkButtonClass('secondary', 'sm')}>Open alert center <ArrowRight size={14} aria-hidden="true" /></Link>} />
          <div className="pt-2">
            {alertsR.status === 'rejected' ? <ErrorState server error={alertsR.reason} title="Could not load alerts" />
              : alerts && alerts.items.length ? <AlertList alerts={alerts.items.slice(0, 5)} pondNames={names} />
              : <EmptyState title="No unresolved alerts">When a reading or forecast crosses a dissolved-oxygen threshold, the alert appears here until it recovers.</EmptyState>}
          </div>
        </Card>
      </div>
    </>
  );
}
