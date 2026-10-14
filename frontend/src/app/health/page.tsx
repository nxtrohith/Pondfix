import type { Metadata } from 'next';
import { CheckCircle, WarningCircle, Question, Minus } from '@phosphor-icons/react/dist/ssr';
import { serverApi } from '@/lib/api/client';
import { fleetStats, loadFleet } from '@/lib/fleet';
import { PARAM_LABEL, fmtThreshold, formatAge, formatDateTime, unitLabel } from '@/lib/format';
import { acceptableText } from '@/lib/alerts';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { ErrorState, Notice } from '@/components/ui/states';
import { RefreshButton } from '@/components/shell/RefreshButton';
import type { Tone } from '@/lib/status';

export const metadata: Metadata = { title: 'System Health' };
export const dynamic = 'force-dynamic';

type Svc = { name: string; tone: Tone; label: string; detail: string };

const dbLabel = (s: string): [Tone, string] => (s === 'up' ? ['healthy', 'Connected'] : s === 'down' ? ['critical', 'Unreachable'] : ['muted', 'Unknown']);
const mlLabel = (s: string): [Tone, string] => (s === 'ready' ? ['healthy', 'Worker responding'] : s === 'unavailable' ? ['critical', 'Unavailable'] : s === 'disabled' ? ['muted', 'Disabled'] : ['muted', 'Unknown']);

async function timedHealth(api: ReturnType<typeof serverApi>) {
  const t0 = Date.now();
  const result = await api.health().then((value) => ({ status: 'fulfilled' as const, value }), (reason: unknown) => ({ status: 'rejected' as const, reason }));
  return { result, ms: Date.now() - t0 };
}

export default async function HealthPage() {
  const api = serverApi();
  const { result: healthR, ms } = await timedHealth(api);
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="System Health" description="Status of the API, database and forecasting service as reported by the backend." actions={<RefreshButton />} />;

  const services: Svc[] = [];
  if (healthR.status === 'fulfilled') {
    const h = healthR.value;
    const [dt, dl] = dbLabel(h.database.status); const [mt, ml] = mlLabel(h.ml.status);
    services.push(
      { name: 'API server', tone: h.status === 'down' ? 'critical' : 'healthy', label: h.status === 'down' ? 'Responding, degraded' : 'Reachable', detail: `Responded in ${ms} ms. Up for ${Math.round(h.uptimeSeconds / 60)} min.` },
      { name: 'Database', tone: dt, label: dl, detail: 'Reported by the API health check (a ping to MongoDB).' },
      { name: 'Forecasting service', tone: mt, label: ml, detail: h.ml.status === 'unavailable' ? 'Measurements and threshold alerts keep working; forecasts are not generated.' : 'A ping to the Python worker succeeded. This does not prove a forecast has run: see "Latest forecast stored" below.' },
    );
  } else {
    services.push({ name: 'API server', tone: 'critical', label: 'Unreachable', detail: 'The frontend could not reach the API.' }, { name: 'Database', tone: 'muted', label: 'Unknown', detail: 'Cannot be determined without the API.' }, { name: 'Forecasting service', tone: 'muted', label: 'Unknown', detail: 'Cannot be determined without the API.' });
  }

  const stats = fleetR.status === 'fulfilled' ? fleetStats(fleetR.value.rows) : null;
  const lastForecast = fleetR.status === 'fulfilled' ? fleetR.value.rows.map((r) => r.summary?.latestPredictionGeneratedAt).filter((x): x is string => Boolean(x)).sort().at(-1) : undefined;
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  const Icon = (t: Tone) => (t === 'healthy' ? CheckCircle : t === 'critical' ? WarningCircle : t === 'warning' ? WarningCircle : Question);

  return (
    <>
      {header}
      <div className="space-y-6">
        {healthR.status === 'rejected' ? <Card><ErrorState server error={healthR.reason} title="The health check failed" /></Card> : null}
        <section aria-label="Services" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {services.map((s) => { const I = Icon(s.tone); return (
            <Card key={s.name} className="p-5">
              <div className="flex items-center justify-between gap-3"><p className="text-[13px] text-ink-soft">{s.name}</p><I size={20} className="text-ink-soft" aria-hidden="true" /></div>
              <div className="mt-3"><StatusPill tone={s.tone}>{s.label}</StatusPill></div>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">{s.detail}</p>
            </Card>
          ); })}
        </section>

        <Card aria-labelledby="data-title">
          <CardHeader id="data-title" title="Data freshness" description="Derived from stored readings and forecasts, not from the health check." />
          {fleetR.status === 'rejected' ? <ErrorState server error={fleetR.reason} title="Could not load pond data" /> : (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 pb-5 pt-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-ink-soft">Ponds</dt><dd className="mt-0.5 text-ink">{stats?.total} total, {stats ? stats.healthy + stats.warning + stats.critical : 0} with fresh data</dd></div>
              <div><dt className="text-ink-soft">Latest reading</dt><dd className="mt-0.5 text-ink">{stats?.latestAt ? `${formatDateTime(stats.latestAt)} (${formatAge(stats.latestAgeMinutes)})` : 'No readings recorded'}</dd></div>
              <div><dt className="text-ink-soft">Latest forecast stored</dt><dd className="mt-0.5 text-ink">{lastForecast ? formatDateTime(lastForecast) : 'No forecast has been stored'}</dd></div>
              <div><dt className="text-ink-soft">Stale after</dt><dd className="mt-0.5 text-ink">{rules ? `${rules.staleAfterMinutes} minutes without a reading` : 'Not available'}</dd></div>
            </dl>
          )}
          {stats && stats.stale + stats.noData > 0 ? <div className="px-5 pb-5"><Notice tone="warning">{stats.stale + stats.noData} of {stats.total} ponds have stale or no data. Stale data is never treated as healthy.</Notice></div> : null}
        </Card>

        <Card aria-labelledby="rules-title">
          <CardHeader id="rules-title" title="Risk rules in use" description="Owned by the backend and read from its API." />
          {rules ? (
            <div className="space-y-3 pb-5 pt-4 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5">
                <StatusPill tone={rules.mode === 'configured' ? 'neutral' : 'warning'}>{rules.mode === 'configured' ? 'Configured limits' : 'Provisional demo limits'}</StatusPill>
                {rules.version ? <span className="text-xs text-ink-soft">Rule set {rules.version}</span> : null}
              </div>
              {rules.parameters ? (
                <Table caption="Active risk rules by parameter" className="min-w-[760px]">
                  <thead><tr><Th>Parameter</Th><Th>Rule</Th><Th>Acceptable range</Th><Th>Warning when</Th><Th>Critical when</Th><Th>Limits are</Th></tr></thead>
                  <tbody>
                    {Object.entries(rules.parameters).map(([key, r]) => {
                      const u = unitLabel(r.unit); const sfx = u ? ` ${u}` : '';
                      const warn = [r.lowWarning !== undefined ? `below ${r.lowWarning}${sfx}` : null, r.highWarning !== undefined ? `above ${r.highWarning}${sfx}` : null].filter(Boolean).join(' or ');
                      const crit = [r.lowCritical !== undefined ? `below ${r.lowCritical}${sfx}` : null, r.highCritical !== undefined ? `above ${r.highCritical}${sfx}` : null].filter(Boolean).join(' or ');
                      return (
                        <Tr key={key}>
                          <Td className="font-medium">{r.label} <span className="font-normal text-ink-soft">({u || 'pH'})</span></Td>
                          <Td>{r.enabled ? <StatusPill tone="healthy">Enabled</StatusPill> : <StatusPill tone="muted">Disabled</StatusPill>}</Td>
                          <Td className="tabular-nums">{acceptableText(r)}</Td>
                          <Td className="tabular-nums">{warn || 'n/a'}</Td>
                          <Td className="tabular-nums">{crit || 'n/a'}</Td>
                          <Td>{r.source === 'provisional_demo' ? 'Provisional demo' : r.source === 'configured' ? 'Configured' : 'Project default'}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              ) : (
                <ul className="space-y-1.5 px-5">
                  <li className="flex items-center gap-3"><StatusPill tone="critical">Critical</StatusPill><span>Dissolved oxygen below {fmtThreshold(rules.dissolvedOxygen.criticalBelow)} {rules.dissolvedOxygen.unit}</span></li>
                  <li className="flex items-center gap-3"><StatusPill tone="warning">Warning</StatusPill><span>Dissolved oxygen from {fmtThreshold(rules.dissolvedOxygen.criticalBelow)} up to, but not including, {fmtThreshold(rules.dissolvedOxygen.warningBelow)} {rules.dissolvedOxygen.unit}</span></li>
                </ul>
              )}
              <div className="space-y-2 px-5">
                {rules.boundaries ? <p className="text-xs text-ink-soft">{rules.boundaries} Data older than {rules.staleAfterMinutes} minutes is stale, never healthy.</p> : null}
                <p className="flex items-start gap-2 text-ink-soft"><Minus size={14} className="mt-0.5 shrink-0" aria-hidden="true" />No rules exist for {rules.unclassifiedParameters.map((p) => PARAM_LABEL[p] ?? p).join(', ')}. These are stored and shown but never raise alerts.</p>
                <p className="text-xs text-ink-soft">{rules.note}</p>
              </div>
            </div>
          ) : <ErrorState server error={rulesR.status === 'rejected' ? rulesR.reason : null} title="Could not load risk rules" />}
        </Card>

        <p className="text-xs leading-relaxed text-ink-soft">A reachable API does not prove every backend service is healthy. The statuses above come from the backend&apos;s own health check; anything it does not report is shown as unknown.</p>
      </div>
    </>
  );
}
