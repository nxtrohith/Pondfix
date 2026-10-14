import type { Metadata } from 'next';
import Link from 'next/link';
import { acceptableText, alertTitle } from '@/lib/alerts';
import { notFound } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import { ApiError, serverApi } from '@/lib/api/client';
import { toRow } from '@/lib/fleet';
import { DEFAULT_UNIT, PARAM_LABEL, SOURCE_LABEL, formatAge, formatDateTime, formatValue, horizonLabel, unitLabel } from '@/lib/format';
import { RISK_LABEL, RISK_TONE } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { SourceBadge, StatusPill } from '@/components/ui/StatusPill';
import { EmptyState, ErrorState, Notice } from '@/components/ui/states';
import { Table, Td, Th, Tr } from '@/components/ui/Table';
import { linkButtonClass } from '@/components/ui/Button';
import { MeasurementTrend } from '@/components/features/MeasurementTrend';
import { AlertList } from '@/components/features/AlertList';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> { return { title: `Pond ${(await params).id.slice(-6)}` }; }

const NOT_RECORDED = <span className="text-ink-soft">Not recorded</span>;

export default async function PondDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = serverApi();
  let pond;
  try { pond = await api.pond(id); } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    return <Card><ErrorState server error={e} title="Could not load this pond" /></Card>;
  }
  const [summaryR, predsR, alertsR, rulesR] = await Promise.allSettled([api.pondSummary(id), api.predictions(id), api.pondAlerts(id, { status: 'ALL', limit: 20 }), api.riskRules()]);
  const summary = summaryR.status === 'fulfilled' ? summaryR.value : null;
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  const row = toRow(pond, summary);

  return (
    <>
      <div className="mb-3"><Link href="/ponds" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"><ArrowLeft size={14} aria-hidden="true" />All ponds</Link></div>
      <PageHeader
        title={pond.name}
        description={summary ? `Latest status, readings, active alerts, forecasts and alert history.` : 'Readings are currently unavailable for this pond.'}
        actions={summary ? <StatusPill tone={RISK_TONE[summary.riskStatus]}>{RISK_LABEL[summary.riskStatus]}</StatusPill> : <StatusPill tone="muted">Unavailable</StatusPill>}
      />
      <div className="space-y-6">
        {summaryR.status === 'rejected' ? <Card><ErrorState server error={summaryR.reason} title="Could not load the latest readings" /></Card> : null}

        {summary ? (
          <section aria-label="Latest measurements" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(['dissolved_oxygen', 'ph', 'temperature'] as const).map((p) => {
              const v = summary.parameters[p];
              return (
                <Card key={p} className="p-5">
                  <div className="flex items-start justify-between gap-2"><p className="text-[13px] text-ink-soft">{PARAM_LABEL[p]}</p>
                    {v ? (v.risk === 'UNKNOWN' ? <StatusPill tone="muted">No alert rule</StatusPill> : <StatusPill tone={RISK_TONE[v.risk]}>{RISK_LABEL[v.risk]}</StatusPill>) : <StatusPill tone="muted">Unavailable</StatusPill>}
                  </div>
                  <p className="mt-3 text-3xl font-medium leading-none tracking-tight tabular-nums">{v ? formatValue(v.value, p) : 'n/a'}<span className="ml-1.5 text-sm font-normal text-ink-soft">{v ? unitLabel(v.unit) : DEFAULT_UNIT[p]}</span></p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    {v ? (<><span className="tabular-nums">{formatDateTime(v.recordedAt)}</span><span>({formatAge(v.ageMinutes)})</span><SourceBadge source={v.source} /></>) : <span>No {PARAM_LABEL[p]?.toLowerCase()} readings recorded</span>}
                  </div>
                  {rules?.parameters?.[p] ? <p className="mt-2 text-xs text-ink-soft">{rules.parameters[p]!.enabled ? `Acceptable ${acceptableText(rules.parameters[p]!)}${rules.parameters[p]!.source === 'provisional_demo' ? ' (provisional demo limits)' : ''}` : 'Alert rule disabled'}</p> : null}
                  {summary.openAlertItems?.filter((a) => a.parameter === p && a.origin === 'observed').map((a) => <p key={a.id} className="mt-2 text-xs font-medium text-warn-text">Active alert: {alertTitle({ parameter: p, direction: a.direction })}, {a.severity === 'CRITICAL' ? 'critical' : 'warning'}{a.status === 'ACKNOWLEDGED' ? ' (acknowledged)' : ''}</p>)}
                </Card>
              );
            })}
          </section>
        ) : null}

        {row.latestAt && summary ? (
          <MeasurementTrend ponds={[{ id: pond.id, name: pond.name, latestAt: row.latestAt, latestAgeMinutes: row.latestAgeMinutes }]} initialPondId={pond.id} rules={rules} allowPondChange={false} title="Measurement history" />
        ) : null}

        <Card aria-labelledby="fc-title">
          <CardHeader id="fc-title" title="Latest forecast" description="Model predictions, not measurements." action={<Link href={`/forecasts?pond=${pond.id}`} className={linkButtonClass('secondary', 'sm')}>Open forecasts</Link>} />
          <div className="pt-3">
            {predsR.status === 'rejected' ? <ErrorState server error={predsR.reason} title="Could not load forecasts" />
              : predsR.value.items.length === 0 ? <EmptyState title="No forecast stored for this pond">Forecasts are produced when a new measurement is ingested and at least 24 hours of earlier readings exist. None has been generated for this pond yet.</EmptyState>
              : (
                <>
                  {predsR.value.items.some((p) => p.dataSource === 'simulated') ? <div className="px-5 pb-3"><Notice>This forecast was generated from a simulated reading, so it does not describe real pond conditions.</Notice></div> : null}
                  <Table caption="Latest forecast values by horizon">
                    <thead><tr><Th>Parameter</Th><Th>Horizon</Th><Th>Forecast for</Th><Th className="text-right">Predicted</Th><Th>Generated</Th><Th>Data used</Th></tr></thead>
                    <tbody>
                      {[...predsR.value.items].sort((a, b) => a.parameter.localeCompare(b.parameter) || (a.horizon?.value ?? 0) - (b.horizon?.value ?? 0)).map((p) => (
                        <Tr key={p.id}>
                          <Td>{PARAM_LABEL[p.parameter] ?? p.parameter}</Td><Td>{horizonLabel(p.horizon?.value)}</Td><Td className="whitespace-nowrap tabular-nums">{formatDateTime(p.forecastFor)}</Td>
                          <Td className="text-right tabular-nums">{formatValue(p.predictedValue, p.parameter)} <span className="text-xs text-ink-soft">{unitLabel(p.unit)}</span></Td>
                          <Td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDateTime(p.generatedAt)}</Td>
                          <Td>{p.dataSource ? <span className="text-xs text-ink-soft">{SOURCE_LABEL[p.dataSource]}</span> : 'n/a'}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
          </div>
        </Card>

        <Card aria-labelledby="pa-title">
          <CardHeader id="pa-title" title="Alert history" description="Most recent 20 alerts for this pond, including resolved ones." action={<Link href={`/alerts?pond=${pond.id}`} className={linkButtonClass('secondary', 'sm')}>Open alert center</Link>} />
          <div className="pt-2">
            {alertsR.status === 'rejected' ? <ErrorState server error={alertsR.reason} title="Could not load alerts" />
              : alertsR.value.items.length === 0 ? <EmptyState title="No alerts for this pond">No reading or forecast has crossed a dissolved-oxygen, pH or temperature limit for this pond.</EmptyState>
              : <AlertList alerts={alertsR.value.items} pondNames={{ [pond.id]: pond.name }} />}
          </div>
        </Card>

        <Card aria-labelledby="meta-title">
          <CardHeader id="meta-title" title="Pond details" description="Metadata recorded for this pond." />
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 pb-5 pt-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['Pond ID', <span key="i" className="font-mono text-xs">{pond.id}</span>],
              ['Source identifier', pond.sourceId ? <span key="s" className="font-mono text-xs">{pond.sourceId}</span> : NOT_RECORDED],
              ['Source dataset', pond.sourceDataset ?? NOT_RECORDED],
              ['Monitoring status', <span key="m" className="capitalize">{pond.status}</span>],
              ['Species', pond.species ?? NOT_RECORDED],
              ['Area', pond.area ? `${pond.area.value} ${pond.area.unit}` : NOT_RECORDED],
              ['Location', pond.location?.description ?? NOT_RECORDED],
              ['Added', pond.createdAt ? formatDateTime(pond.createdAt) : NOT_RECORDED],
            ] as const).map(([k, v]) => (<div key={k}><dt className="text-ink-soft">{k}</dt><dd className="mt-0.5 break-words text-ink">{v}</dd></div>))}
          </dl>
        </Card>
      </div>
    </>
  );
}
