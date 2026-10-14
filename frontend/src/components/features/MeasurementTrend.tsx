'use client';
import { useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { DataSource, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { RANGE_MS, breakGaps, gapThreshold, splitBySource, type RangeKey } from '@/lib/chart';
import { PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatAge, fmtThreshold } from '@/lib/format';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select, Segmented } from '../ui/Field';
import { ChartSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { TrendChart, SERIES_COLOR, type Threshold } from '../charts/TrendChart';

export interface TrendPond { id: string; name: string; latestAt: string | null; latestAgeMinutes: number | null; latestSource?: DataSource }
const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
type P = (typeof PARAMS)[number];

interface Props { ponds: TrendPond[]; initialPondId: string; rules: RiskRules | null; title?: string; allowPondChange?: boolean; height?: number }

export function MeasurementTrend({ ponds, initialPondId, rules, title = 'Water-quality trend', allowPondChange = true, height = 280 }: Props) {
  const [pondId, setPondId] = useState(initialPondId);
  const [parameter, setParameter] = useState<P>('dissolved_oxygen');
  const [range, setRange] = useState<RangeKey>('3d');
  const pond = ponds.find((p) => p.id === pondId) ?? ponds[0];
  const latestAt = pond?.latestAt ?? null;

  const q = useApiQuery(
    async (signal) => {
      if (!pond || !latestAt) return null;
      const to = new Date(latestAt);
      const from = new Date(+to - RANGE_MS[range]);
      return browserApi().measurements(pond.id, { from: from.toISOString(), to: to.toISOString(), parameter, limit: 1000 }, signal);
    },
    [pond?.id, latestAt, range, parameter],
    Boolean(pond && latestAt),
  );

  const { points, simulated, unit, sources } = useMemo(() => {
    const items = q.data?.items ?? [];
    const split = splitBySource(items, parameter);
    const src = new Set<string>(items.filter((m) => m.values.some((v) => v.parameter === parameter)).map((m) => m.source));
    return { points: breakGaps(split.recorded, gapThreshold(split.recorded.map((p) => p.t))), simulated: split.simulated, unit: split.unit, sources: [...src] as (keyof typeof SOURCE_LABEL)[] };
  }, [q.data, parameter]);

  const thresholds: Threshold[] = parameter === 'dissolved_oxygen' && rules
    ? [{ y: rules.dissolvedOxygen.warningBelow, label: `Warning below ${fmtThreshold(rules.dissolvedOxygen.warningBelow)}`, tone: 'warn' }, { y: rules.dissolvedOxygen.criticalBelow, label: `Critical below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)}`, tone: 'crit' }]
    : [];

  const stale = pond?.latestAgeMinutes !== null && pond?.latestAgeMinutes !== undefined && rules ? pond.latestAgeMinutes > rules.staleAfterMinutes : false;
  const description = latestAt ? `Window ends at the last recorded reading, ${formatDateTime(latestAt)}.` : 'No readings recorded yet.';

  return (
    <Card aria-labelledby="trend-title">
      <CardHeader
        id="trend-title"
        title={title}
        description={description}
        action={<Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 h' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' }]} />}
      />
      <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
        {allowPondChange ? (
          <div className="w-full sm:w-56">
            <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          </div>
        ) : null}
        <Segmented label="Parameter" value={parameter} onChange={setParameter} options={PARAMS.map((p) => ({ value: p, label: p === 'dissolved_oxygen' ? 'DO' : p === 'ph' ? 'pH' : 'Temperature' }))} />
      </div>
      <div className="px-5 pb-5 pt-4">
        {stale && latestAt ? (
          <div className="mb-3"><Notice tone="warning">Latest reading is {formatAge(pond?.latestAgeMinutes)}. These are recorded {sources.length ? sources.map((s) => SOURCE_LABEL[s].toLowerCase()).join(' and ') : 'historical'} readings, not current conditions.</Notice></div>
        ) : null}
        {!pond || !latestAt ? (
          <EmptyState title="No measurements yet">Readings appear here once this pond has data. Use the Simulation page to submit a clearly marked test reading.</EmptyState>
        ) : q.loading && !q.data ? (
          <ChartSkeleton height={height} />
        ) : q.error ? (
          <ErrorState error={q.error} title="Could not load measurements" onRetry={q.reload} />
        ) : points.length === 0 && simulated.length === 0 ? (
          <EmptyState title={`No ${PARAM_LABEL[parameter]?.toLowerCase()} readings in this window`}>This pond has no recorded {PARAM_LABEL[parameter]?.toLowerCase()} values between the selected dates. Try a longer range or another parameter.</EmptyState>
        ) : (
          <>
            <TrendChart series={[{ key: 'obs', label: `${PARAM_LABEL[parameter]} (recorded)`, points, color: SERIES_COLOR.observed }, ...(simulated.length ? [{ key: 'sim', label: 'Simulated reading', points: simulated, color: SERIES_COLOR.forecast, dotsOnly: true }] : [])]} parameter={parameter} unit={unit} thresholds={thresholds} height={height}
              summaryLabel={`${PARAM_LABEL[parameter]} for ${pond.name}, ${range} window`} />
            {q.data?.nextCursor ? <p className="mt-2 text-xs text-warn-text">Showing the newest 1000 readings in this window; older readings are not drawn.</p> : null}
            <p className="mt-2 text-xs text-ink-soft">Source: {sources.map((s) => SOURCE_LABEL[s]).join(', ')}. Gaps in the line are periods with no recorded readings; nothing is interpolated.</p>
          </>
        )}
      </div>
    </Card>
  );
}
