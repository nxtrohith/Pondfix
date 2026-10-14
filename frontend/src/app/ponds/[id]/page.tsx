import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { ApiError, serverApi } from '@/lib/api/client';
import { toRow } from '@/lib/fleet';
import { ALERT_PARAMETERS } from '@/lib/alerts';
import { formatDateTime } from '@/lib/format';
import { POND_STATUS } from '@/lib/terms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LastUpdated } from '@/components/ui/LastUpdated';
import { ErrorState } from '@/components/ui/states';
import { MeasurementTrend } from '@/components/features/MeasurementTrend';
import { WaterQualityCard } from '@/components/features/WaterQualityCard';
import { ForecastOutlook } from '@/components/features/ForecastOutlook';
import { AlertFeed } from '@/components/features/AlertFeed';
import { AlertCardList } from '@/components/features/AlertCard';
import { SpeciesSettings } from '@/components/features/SpeciesSettings';
import { isConfigured, speciesLine } from '@/lib/species';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try { const pond = await serverApi().pond(id); return { title: toRow(pond, null).pond.name }; } catch { return { title: 'Pond' }; }
}

const NOT_RECORDED = <span className="text-ink-soft">Not recorded</span>;
const Section = ({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div><h2 id={id} className="text-lg font-medium tracking-tight text-ink">{title}</h2>{hint ? <p className="mt-0.5 text-[13px] text-ink-soft">{hint}</p> : null}</div>
    {children}
  </section>
);

/** Everything about one pond, top to bottom: how it is now, what is wrong, what may happen next, then the past. */
export default async function PondDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = serverApi();
  let pond;
  try { pond = await api.pond(id); } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    return <Card><ErrorState server error={e} title="Could not load this pond" /></Card>;
  }
  const [summaryR, predsR, openR, pastR, rulesR] = await Promise.allSettled([
    api.pondSummary(id), api.predictions(id), api.pondAlerts(id, { status: 'OPEN', origin: 'observed', limit: 20 }), api.pondAlerts(id, { status: 'RESOLVED', limit: 5 }), api.riskRules(),
  ]);
  const summary = summaryR.status === 'fulfilled' ? summaryR.value : null;
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  const row = toRow(pond, summary);
  const problems = openR.status === 'fulfilled' ? openR.value.items : null;
  const past = pastR.status === 'fulfilled' ? pastR.value.items : [];
  const preds = predsR.status === 'fulfilled' ? predsR.value.items : null;

  return (
    <>
      <div className="mb-3"><Link href="/ponds" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"><ArrowLeft size={14} aria-hidden="true" />All ponds</Link></div>
      <PageHeader
        title={row.pond.name}
        description={<>{POND_STATUS[row.risk].summary} <span className={isConfigured(pond.speciesConfig) ? 'text-ink' : 'text-warn-text'}>{isConfigured(pond.speciesConfig) ? `Species: ${speciesLine(pond.speciesConfig)}.` : 'Species not set yet.'}</span></>}
        actions={(<><StatusBadge status={row.risk} scope="pond" className="h-8 px-3 text-sm" /><LastUpdated at={row.latestAt} ageMinutes={row.latestAgeMinutes} className="text-[13px] text-ink-soft" /></>)}
      />
      <div className="space-y-8">
        {summaryR.status === 'rejected' ? <Card><ErrorState server error={summaryR.reason} title="Could not load the latest readings" /></Card> : null}

        <Section id="attention" title="What needs attention?">
          {openR.status === 'rejected' ? <Card><ErrorState server error={openR.reason} title="Could not load current problems" /></Card>
            : problems && problems.length ? <AlertFeed alerts={problems} pondNames={{ [pond.id]: row.pond.name }} compact showGuidance />
            : (
              <p className="flex items-start gap-2 rounded-xl border border-line bg-card px-4 py-4 text-[13px] text-ink">
                <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-ok-text" aria-hidden="true" />
                <span><span className="font-medium">No current problems.</span> {row.risk === 'STALE' || row.risk === 'NO_DATA' ? 'The readings are not recent, so check that the sensors are sending data.' : 'Every reading is within the acceptable range.'}</span>
              </p>
            )}
        </Section>

        {summary ? (
          <Section id="now" title="Current water quality" hint="The latest reading of each factor.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {ALERT_PARAMETERS.map((p) => <WaterQualityCard key={p} parameter={p} reading={summary.parameters[p]} rule={rules?.parameters?.[p]} />)}
            </div>
          </Section>
        ) : null}

        {row.latestAt && summary ? (
          <Section id="trends" title="Water quality over time">
            <MeasurementTrend ponds={[{ id: pond.id, name: row.pond.name, latestAt: row.latestAt, latestAgeMinutes: row.latestAgeMinutes }]} initialPondId={pond.id} rules={rules} allowPondChange={false} forecast={preds ?? undefined} title="Trends" />
          </Section>
        ) : null}

        <Section id="next" title="What may happen next?" hint="Estimates from the forecasting model for the next few hours. They are not measurements.">
          {predsR.status === 'rejected' ? <Card><ErrorState server error={predsR.reason} title="Could not load the forecast" /></Card>
            : <ForecastOutlook predictions={preds ?? []} readings={summary?.parameters ?? {}} />}
        </Section>

        <Section id="past" title="Earlier problems" hint="The five most recent that have been resolved.">
          {pastR.status === 'rejected' ? <Card><ErrorState server error={pastR.reason} title="Could not load earlier problems" /></Card>
            : past.length === 0 ? <p className="text-[13px] text-ink-soft">No resolved problems for this pond yet.</p>
            : <AlertCardList alerts={past} compact />}
          <p className="text-[13px]"><Link href={`/alerts?pond=${pond.id}`} className="text-olive-text underline-offset-2 hover:underline">See every alert for this pond</Link></p>
        </Section>

        <SpeciesSettings pondId={pond.id} pondName={row.pond.name} initial={pond.speciesConfig} />


        <details className="rounded-xl border border-line bg-card">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-ink">Pond details</summary>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 pb-5 pt-1 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['Name', row.pond.name], ['Source identifier', pond.sourceId ? <span key="s" className="font-mono text-xs">{pond.sourceId}</span> : NOT_RECORDED],
              ['Data from', pond.sourceDataset ?? NOT_RECORDED], ['Monitoring', <span key="m" className="capitalize">{pond.status}</span>],
              ['Species', isConfigured(pond.speciesConfig) ? speciesLine(pond.speciesConfig) : NOT_RECORDED], ['Imported species note', pond.species ?? NOT_RECORDED], ['Area', pond.area ? `${pond.area.value} ${pond.area.unit}` : NOT_RECORDED],
              ['Location', pond.location?.description ?? NOT_RECORDED], ['Added', pond.createdAt ? formatDateTime(pond.createdAt) : NOT_RECORDED],
            ] as const).map(([k, v]) => (<div key={k}><dt className="text-ink-soft">{k}</dt><dd className="mt-0.5 break-words text-ink">{v}</dd></div>))}
          </dl>
        </details>
      </div>
    </>
  );
}
