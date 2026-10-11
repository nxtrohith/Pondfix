'use client';
import { useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { DataSource, Prediction, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { RANGE_MS, breakGaps, gapThreshold, splitBySource, type Point } from '@/lib/chart';
import { thresholdLines } from '@/lib/limits';
import { PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatAge } from '@/lib/format';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select, Segmented } from '../ui/Field';
import { ChartSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { TrendChart, SERIES_COLOR } from '../charts/TrendChart';

export interface TrendPond { id: string; name: string; latestAt: string | null; latestAgeMinutes: number | null; latestSource?: DataSource }
const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
type P = (typeof PARAMS)[number];
type Range = '24h' | '7d' | '30d';
const FACTOR: Record<P, string> = { dissolved_oxygen: 'Oxygen', ph: 'pH', temperature: 'Temperature' };

interface Props { ponds: TrendPond[]; initialPondId: string; rules: RiskRules | null; title?: string; allowPondChange?: boolean; height?: number; /** The pond's latest forecast, drawn as dashed points after the readings. */ forecast?: Prediction[] }

/** Past readings for one water-quality factor, with the backend's limit lines and (optionally) the pond's latest forecast. */
export function MeasurementTrend({ ponds, initialPondId, rules, title = 'Water quality trends', allowPondChange = true, height = 280, forecast }: Props) {
  const [pondId, setPondId] = useState(initialPondId);
  const [parameter, setParameter] = useState<P>('dissolved_oxygen');
  const [range, setRange] = useState<Range>('24h');
  const pond = ponds.find((p) => p.id === pondId) ?? ponds[0];
  const latestAt = pond?.latestAt ?? null;
  const hourly = range === '30d';

  const q = useApiQuery(
    async (signal) => {
      if (!pond || !latestAt) return null;
      const to = new Date(latestAt);
      const from = new Date(+to - RANGE_MS[range]);
      const api = browserApi();
      // 30 days of raw 15-minute readings would not fit one page, so that range shows hourly averages.
      if (hourly) {
        const r = await api.analytics(pond.id, { parameter, from: from.toISOString(), to: to.toISOString(), bucket: 'hour' }, signal);
        return { kind: 'hourly' as const, unit: r.summary.unit, sources: r.summary.sources ?? [], points: r.series.map((b) => ({ t: Date.parse(b.bucketStart), v: b.mean })), simulated: [] as Point[], more: false };
      }
      const r = await api.measurements(pond.id, { from: from.toISOString(), to: to.toISOString(), parameter, limit: 1000 }, signal);
      const split = splitBySource(r.items, parameter);
      const sources = [...new Set(r.items.filter((m) => m.values.some((v) => v.parameter === parameter)).map((m) => m.source))];
      return { kind: 'raw' as const, unit: split.unit, sources, points: split.recorded, simulated: split.simulated, more: Boolean(r.nextCursor) };
    },
    [pond?.id, latestAt, range, parameter],
    Boolean(pond && latestAt),
  );

  const data = q.data;
  const line = useMemo(() => (data ? breakGaps(data.points.map((p) => ({ t: p.t, v: p.v as number })), hourly ? 3 * 3600_000 : gapThreshold(data.points.map((p) => p.t))) : []), [data, hourly]);
  const fc = useMemo(() => (forecast ?? []).filter((f) => f.parameter === parameter).map((f) => ({ t: Date.parse(f.forecastFor), v: f.predictedValue })).sort((a, b) => a.t - b.t), [forecast, parameter]);
  const sources = (data?.sources ?? []) as DataSource[];
  const stale = pond?.latestAgeMinutes !== null && pond?.latestAgeMinutes !== undefined && rules ? pond.latestAgeMinutes > rules.staleAfterMinutes : false;
  const empty = data && data.points.length === 0 && data.simulated.length === 0;

  return (
    <Card aria-labelledby="trend-title">
      <CardHeader
        id="trend-title"
        title={title}
        description={latestAt ? `Up to the last reading, ${formatDateTime(latestAt)}.` : 'No readings recorded yet.'}
        action={<Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />}
      />
      <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
        {allowPondChange ? (
          <div className="w-full sm:w-56">
            <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          </div>
        ) : null}
        <Segmented label="Water quality factor" value={parameter} onChange={setParameter} options={PARAMS.map((p) => ({ value: p, label: FACTOR[p] }))} />
      </div>
      <div className="px-5 pb-5 pt-4">
        {stale && latestAt ? (
          <div className="mb-3"><Notice tone="warning">The last reading was {formatAge(pond?.latestAgeMinutes)}. This chart shows {sources.length ? sources.map((s) => SOURCE_LABEL[s].toLowerCase()).join(' and ') : 'earlier readings'}, not current conditions.</Notice></div>
        ) : null}
        {!pond || !latestAt ? (
          <EmptyState title="No readings yet">Readings appear here once this pond has data.</EmptyState>
        ) : q.loading && !q.data ? (
          <ChartSkeleton height={height} />
        ) : q.error ? (
          <ErrorState error={q.error} title="Could not load readings" onRetry={q.reload} />
        ) : empty ? (
          <EmptyState title={`No ${PARAM_LABEL[parameter]?.toLowerCase()} readings in this period`}>Try a longer period or another factor.</EmptyState>
        ) : (
          <>
            <TrendChart
              series={[
                { key: 'obs', label: hourly ? `${PARAM_LABEL[parameter]} (hourly average)` : `${PARAM_LABEL[parameter]} (readings)`, points: line, color: SERIES_COLOR.observed },
                ...(data && data.simulated.length ? [{ key: 'sim', label: SOURCE_LABEL.simulated, points: data.simulated, color: SERIES_COLOR.forecast, dotsOnly: true }] : []),
                ...(fc.length ? [{ key: 'fc', label: 'Forecast (estimate, not a reading)', points: fc, color: SERIES_COLOR.forecast, dashed: true }] : []),
              ]}
              parameter={parameter} unit={data?.unit} height={height} thresholds={thresholdLines(rules, parameter)}
              summaryLabel={`${PARAM_LABEL[parameter]} for ${pond.name}, ${range} period`}
            />
            {data?.more ? <p className="mt-2 text-xs text-warn-text">Only the newest 1000 readings are drawn; choose a shorter period to see older ones.</p> : null}
            <p className="mt-2 text-xs text-ink-soft">Source: {sources.length ? sources.map((s) => SOURCE_LABEL[s]).join(', ') : 'recorded readings'}. Gaps in the line mean no reading was recorded; nothing is filled in.</p>
          </>
        )}
      </div>
    </Card>
  );
}
