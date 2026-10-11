'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { browserApi } from '@/lib/api/client';
import type { ForecastParameter, Prediction, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { breakGaps, gapThreshold, splitBySource } from '@/lib/chart';
import { PARAM_LABEL, SOURCE_LABEL, formatAge, formatDateTime, formatValue, horizonLabel, unitLabel, fmtThreshold } from '@/lib/format';
import type { TrendPond } from './MeasurementTrend';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select, Segmented } from '../ui/Field';
import { ChartSkeleton, TableSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { SourceBadge } from '../ui/StatusPill';
import { Table, Td, Th, Tr } from '../ui/Table';
import { linkButtonClass } from '../ui/Button';
import { TrendChart, SERIES_COLOR, type Threshold } from '../charts/TrendChart';

const PARAMS: ForecastParameter[] = ['dissolved_oxygen', 'ph', 'temperature'];
const HOUR = 3600_000;

export function ForecastWorkspace({ ponds, initialPondId, rules }: { ponds: TrendPond[]; initialPondId: string; rules: RiskRules | null }) {
  const [pondId, setPondId] = useState(initialPondId);
  const [parameter, setParameter] = useState<ForecastParameter>('dissolved_oxygen');
  const pond = ponds.find((p) => p.id === pondId) ?? ponds[0];

  const preds = useApiQuery((signal) => browserApi().predictions(pondId, { parameter }, signal), [pondId, parameter], Boolean(pond));
  const items: Prediction[] = useMemo(() => [...(preds.data?.items ?? [])].sort((a, b) => Date.parse(a.forecastFor) - Date.parse(b.forecastFor)), [preds.data]);

  // Issue time of the batch = forecastFor minus its horizon; observations are drawn around it.
  const issueAt = useMemo(() => {
    const first = items[0];
    if (!first) return pond?.latestAt ? Date.parse(pond.latestAt) : null;
    return Date.parse(first.forecastFor) - (first.horizon?.value ?? 0) * 60_000;
  }, [items, pond]);
  const endAt = items.length ? Date.parse(items[items.length - 1]!.forecastFor) : issueAt;

  const obs = useApiQuery(
    (signal) => browserApi().measurements(pondId, { from: new Date(issueAt! - 6 * HOUR).toISOString(), to: new Date(endAt! + 15 * 60_000).toISOString(), parameter, limit: 1000 }, signal),
    [pondId, parameter, issueAt, endAt],
    Boolean(pond) && issueAt !== null && !preds.loading,
  );

  const { observed, simulatedPts } = useMemo(() => {
    const split = splitBySource(obs.data?.items ?? [], parameter);
    return { observed: breakGaps(split.recorded, gapThreshold(split.recorded.map((r) => r.t))), simulatedPts: split.simulated };
  }, [obs.data, parameter]);

  const unit = items[0]?.unit;
  const thresholds: Threshold[] = parameter === 'dissolved_oxygen' && rules
    ? [{ y: rules.dissolvedOxygen.warningBelow, label: `Warning below ${fmtThreshold(rules.dissolvedOxygen.warningBelow)}`, tone: 'warn' }, { y: rules.dissolvedOxygen.criticalBelow, label: `Critical below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)}`, tone: 'crit' }]
    : [];
  const horizons = [...new Set(items.map((i) => i.horizon?.value).filter((h): h is number => h !== undefined))];
  const simulated = items.some((i) => i.dataSource === 'simulated');
  const latestObserved = pond?.latestAt ? { at: pond.latestAt, age: pond.latestAgeMinutes, source: pond.latestSource } : null;

  if (!pond) return <Card><EmptyState title="No ponds available">Forecasts are created per pond. Import or register a pond first.</EmptyState></Card>;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="fc-sel">
        <CardHeader id="fc-sel" title="Forecast selection" description="Forecasts are model predictions for the next few hours, not measurements." />
        <div className="grid grid-cols-1 items-end gap-3 px-5 pb-5 pt-4 sm:grid-cols-[minmax(0,260px)_auto]">
          <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          <div className="flex flex-col items-start gap-1.5"><span className="text-[13px] font-medium text-ink" id="param-label">Parameter</span>
            <Segmented label="Parameter" value={parameter} onChange={setParameter} options={PARAMS.map((p) => ({ value: p, label: p === 'dissolved_oxygen' ? 'Dissolved oxygen' : PARAM_LABEL[p]! }))} />
          </div>
        </div>
        <div className="border-t border-line px-5 py-3 text-[13px] text-ink-soft">
          <span className="text-ink">Latest reading: </span>{latestObserved ? <>{formatDateTime(latestObserved.at)} ({formatAge(latestObserved.age)}){latestObserved.source ? <> <SourceBadge source={latestObserved.source} /></> : null}</> : 'none recorded'}.
          {' '}Horizons in this forecast: {horizons.length ? horizons.map((h) => horizonLabel(h)).join(', ') : 'none yet'}.
        </div>
      </Card>

      {simulated ? <Notice>This forecast was generated from a simulated reading, so it does not describe real pond conditions.</Notice> : null}

      <Card aria-labelledby="fc-chart">
        <CardHeader id="fc-chart" title={`${PARAM_LABEL[parameter]} forecast`} description="Solid line: recorded readings. Dashed line with open markers: model forecast. Simulated test readings are shown separately." />
        <div className="px-5 pb-5 pt-4">
          {preds.loading && !preds.data ? <ChartSkeleton /> : preds.error ? <ErrorState error={preds.error} title="Could not load forecasts" onRetry={preds.reload} />
            : items.length === 0 ? (
              <EmptyState title="No forecast stored for this pond" action={<Link href="/simulation" className={linkButtonClass('secondary', 'sm')}>Open Simulation</Link>}>
                Forecasts are generated when a new measurement is ingested and at least 24 hours of earlier readings exist for the pond. None has been stored for {pond.name}. The Simulation page can replay a reading at a time inside this pond&apos;s historical range to produce one.
              </EmptyState>
            ) : obs.error ? <ErrorState error={obs.error} title="Could not load recorded readings" onRetry={obs.reload} />
            : (
              <TrendChart
                parameter={parameter}
                unit={unit}
                thresholds={thresholds}
                summaryLabel={`${PARAM_LABEL[parameter]} recorded readings and forecast for ${pond.name}`}
                series={[
                  { key: 'obs', label: 'Recorded', points: observed, color: SERIES_COLOR.observed },
                  ...(simulatedPts.length ? [{ key: 'sim', label: 'Simulated reading (input to this forecast)', points: simulatedPts, color: SERIES_COLOR.muted, dotsOnly: true }] : []),
                  { key: 'fc', label: 'Forecast', points: items.map((i) => ({ t: Date.parse(i.forecastFor), v: i.predictedValue })), color: SERIES_COLOR.forecast, dashed: true },
                  { key: 'fcdots', label: 'Forecast points', hideLegend: true, points: items.map((i) => ({ t: Date.parse(i.forecastFor), v: i.predictedValue })), color: SERIES_COLOR.forecast, dotsOnly: true },
                ]}
              />
            )}
        </div>
      </Card>

      {items.length > 0 || preds.loading ? (
      <Card aria-labelledby="fc-table">
        <CardHeader id="fc-table" title="Forecast values" description={preds.data?.generatedAt ? `Generated ${formatDateTime(preds.data.generatedAt)}` : 'Most recent batch for this pond'} />
        <div className="pt-3">
          {preds.loading && !preds.data ? <TableSkeleton rows={3} cols={6} /> : items.length === 0 ? <EmptyState title="Nothing to show" /> : (
            <Table caption={`${PARAM_LABEL[parameter]} forecast values by horizon`}>
              <thead><tr><Th>Horizon</Th><Th>Forecast for</Th><Th className="text-right">Predicted</Th><Th className="text-right">If unchanged</Th><Th className="text-right">Typical error</Th><Th>Model</Th><Th>Data used</Th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <Tr key={i.id}>
                    <Td>{horizonLabel(i.horizon?.value)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDateTime(i.forecastFor)}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatValue(i.predictedValue, i.parameter)} <span className="text-xs font-normal text-ink-soft">{unitLabel(i.unit)}</span></Td>
                    <Td className="text-right tabular-nums text-ink-soft">{i.persistenceBaseline !== undefined ? formatValue(i.persistenceBaseline, i.parameter) : 'n/a'}</Td>
                    <Td className="text-right tabular-nums text-ink-soft">{i.typicalAbsError !== undefined ? `${formatValue(i.typicalAbsError, i.parameter)} ${unitLabel(i.unit)}` : 'n/a'}</Td>
                    <Td className="text-ink-soft">{i.selectedModel ?? i.modelName ?? 'n/a'}{i.modelVersion ? <span className="block font-mono text-[11px]">{i.modelVersion}</span> : null}</Td>
                    <Td>{i.dataSource ? <SourceBadge source={i.dataSource} /> : 'n/a'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="space-y-1.5 px-5 pb-5 pt-3 text-xs leading-relaxed text-ink-soft">
            <p><span className="font-medium text-ink">If unchanged</span> is the value if the last reading simply stayed the same. <span className="font-medium text-ink">Typical error</span> is the median absolute error of this model in its validation period. It is not a confidence interval and does not bound this prediction.</p>
            <p>The model covers dissolved oxygen, pH and temperature at 15 minutes, 1 hour and 3 hours. Ammonia and water level are not forecast. {SOURCE_LABEL.historical} and {SOURCE_LABEL.simulated.toLowerCase()} inputs are labelled; only readings from real sensors are {SOURCE_LABEL.live.toLowerCase()}.</p>
          </div>
        </div>
      </Card>
      ) : null}
    </div>
  );
}
