'use client';
import { useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { breakGaps } from '@/lib/chart';
import { PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatValue, unitLabel, fmtThreshold } from '@/lib/format';
import type { TrendPond } from './MeasurementTrend';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select, Segmented } from '../ui/Field';
import { ChartSkeleton, TableSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/Table';
import { TrendChart, SERIES_COLOR, type Threshold } from '../charts/TrendChart';

const DAY = 86400_000;
const RANGES = { '24h': DAY, '3d': 3 * DAY, '7d': 7 * DAY, '30d': 30 * DAY } as const;
type RangeKey = keyof typeof RANGES;
const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
type P = (typeof PARAMS)[number];
const MAX_COMPARE = 6;

const fmt = (v: number | undefined, p: string, unit?: string) => (v === undefined ? 'n/a' : formatValue(v, p, true, unit));

export function AnalyticsWorkspace({ ponds, initialPondId, rules }: { ponds: TrendPond[]; initialPondId: string; rules: RiskRules | null }) {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [parameter, setParameter] = useState<P>('dissolved_oxygen');
  const [range, setRange] = useState<RangeKey>('7d');
  const [bucketPref, setBucketPref] = useState<'auto' | 'hour' | 'day'>('auto');
  const [pondId, setPondId] = useState(initialPondId);
  const [picked, setPicked] = useState<string[]>(() => ponds.slice(0, 3).map((p) => p.id));

  const bucket = bucketPref === 'auto' ? (RANGES[range] <= 7 * DAY ? 'hour' : 'day') : bucketPref;
  const pond = ponds.find((p) => p.id === pondId);

  const endFor = (list: (TrendPond | undefined)[]) => {
    const t = list.map((p) => (p?.latestAt ? Date.parse(p.latestAt) : NaN)).filter(Number.isFinite);
    return t.length ? Math.max(...t) : null;
  };
  const singleEnd = endFor([pond]);
  const compareEnd = endFor(picked.map((id) => ponds.find((p) => p.id === id)));

  const single = useApiQuery(
    (signal) => browserApi().analytics(pondId, { parameter, from: new Date(singleEnd! - RANGES[range]).toISOString(), to: new Date(singleEnd!).toISOString(), bucket }, signal),
    [pondId, parameter, range, bucket, singleEnd], mode === 'single' && singleEnd !== null,
  );
  const compare = useApiQuery(
    (signal) => browserApi().compare({ parameter, from: new Date(compareEnd! - RANGES[range]).toISOString(), to: new Date(compareEnd!).toISOString(), pondIds: picked.join(',') }, signal),
    [picked.join(','), parameter, range, compareEnd], mode === 'compare' && picked.length > 0 && compareEnd !== null,
  );

  const series = useMemo(() => {
    const s = single.data?.series ?? [];
    const step = (bucket === 'hour' ? 3600_000 : DAY) * 2.5;
    const line = (pick: (b: (typeof s)[number]) => number) => breakGaps(s.map((b) => ({ t: Date.parse(b.bucketStart), v: pick(b) })), step);
    return [
      { key: 'mean', label: 'Mean', points: line((b) => b.mean), color: SERIES_COLOR.observed },
      { key: 'min', label: 'Minimum', points: line((b) => b.min), color: SERIES_COLOR.secondary, dashed: true },
      { key: 'max', label: 'Maximum', points: line((b) => b.max), color: SERIES_COLOR.muted, dashed: true },
    ];
  }, [single.data, bucket]);

  const thresholds: Threshold[] = parameter === 'dissolved_oxygen' && rules
    ? [{ y: rules.dissolvedOxygen.warningBelow, label: `Warning below ${fmtThreshold(rules.dissolvedOxygen.warningBelow)}`, tone: 'warn' }, { y: rules.dissolvedOxygen.criticalBelow, label: `Critical below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)}`, tone: 'crit' }]
    : [];
  const sm = single.data?.summary;
  const u = sm?.unit;

  if (!ponds.length) return <Card><EmptyState title="No ponds available">Analytics need stored measurements. Import or register ponds first.</EmptyState></Card>;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="an-ctl">
        <CardHeader id="an-ctl" title="Explore stored measurements" description="Statistics are calculated by the API from recorded readings only. Nothing is estimated or interpolated." />
        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Segmented label="View" value={mode} onChange={setMode} options={[{ value: 'single', label: 'Single pond' }, { value: 'compare', label: 'Compare ponds' }]} />
            <Segmented label="Parameter" value={parameter} onChange={setParameter} options={PARAMS.map((p) => ({ value: p, label: p === 'dissolved_oxygen' ? 'DO' : p === 'ph' ? 'pH' : 'Temperature' }))} />
            <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 h' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />
          </div>
          {mode === 'single' ? (
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full sm:w-60"><Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field></div>
              <div className="w-full sm:w-44"><Field label="Aggregation">{(id) => <Select id={id} value={bucketPref} onChange={(e) => setBucketPref(e.target.value as typeof bucketPref)}><option value="auto">Automatic</option><option value="hour">Hourly</option><option value="day">Daily</option></Select>}</Field></div>
            </div>
          ) : null}
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">The time window ends at the latest recorded reading of the selected pond{mode === 'compare' ? 's' : ''}{(mode === 'single' ? singleEnd : compareEnd) ? ` (${formatDateTime(new Date((mode === 'single' ? singleEnd : compareEnd)!).toISOString())})` : ''}, so historical ponds are not shown as empty. This is recorded data, not current conditions.</p>
      </Card>

      {mode === 'single' ? (
        <>
          <section aria-label="Summary statistics" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {single.loading && !single.data ? Array.from({ length: 5 }).map((_, i) => <Card key={i} className="p-4"><div className="skeleton h-4 w-16" /><div className="skeleton mt-3 h-7 w-20" /></Card>) : [
              ['Readings', sm ? String(sm.count) : 'n/a'], ['Mean', fmt(sm?.mean, parameter, u)], ['Minimum', fmt(sm?.min, parameter, u)], ['Maximum', fmt(sm?.max, parameter, u)],
              ['Change over window', sm?.change === undefined ? 'n/a' : `${sm.change > 0 ? '+' : ''}${formatValue(sm.change, parameter)} ${unitLabel(u)}`.trim()],
            ].map(([k, v]) => <Card key={k} className="p-4"><p className="text-[13px] text-ink-soft">{k}</p><p className="mt-2 text-xl font-medium tabular-nums text-ink">{v}</p></Card>)}
          </section>
          <Card aria-labelledby="an-chart">
            <CardHeader id="an-chart" title={`${PARAM_LABEL[parameter]} over time`} description={single.data?.method ?? 'Observed readings'} />
            <div className="px-5 pb-5 pt-4">
              {single.loading && !single.data ? <ChartSkeleton /> : single.error ? <ErrorState error={single.error} title="Could not load analytics" onRetry={single.reload} />
                : singleEnd === null ? <EmptyState title="This pond has no readings">Choose another pond, or submit a test reading on the Simulation page.</EmptyState>
                : !sm || sm.count === 0 ? <EmptyState title={`No ${PARAM_LABEL[parameter]?.toLowerCase()} readings in this window`}>Try a longer range or another parameter.</EmptyState>
                : (
                  <>
                    <TrendChart series={series} parameter={parameter} unit={u} thresholds={thresholds} summaryLabel={`${PARAM_LABEL[parameter]} ${bucket === 'hour' ? 'hourly' : 'daily'} mean, minimum and maximum for ${pond?.name}`} />
                    <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                      Based on {sm.count} recorded readings from {formatDateTime(single.data?.range?.from)} to {formatDateTime(single.data?.range?.to)}. Source: {(sm.sources ?? []).map((s) => (s in SOURCE_LABEL ? SOURCE_LABEL[s as keyof typeof SOURCE_LABEL] : s)).join(', ') || 'n/a'}.
                      {sm.slopePerHour !== null && sm.slopePerHour !== undefined ? ` Linear trend across the window: ${sm.slopePerHour > 0 ? '+' : ''}${formatValue(sm.slopePerHour, parameter)} ${unitLabel(u)} per hour (a description of this window, not a prediction).` : ''}
                    </p>
                  </>
                )}
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card aria-labelledby="cmp-pick">
            <CardHeader id="cmp-pick" title="Choose ponds to compare" description={`Select up to ${MAX_COMPARE} ponds. All use the same time window.`} />
            <fieldset className="px-5 pb-5 pt-3">
              <legend className="sr-only">Ponds to compare</legend>
              <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {ponds.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface">
                      <input type="checkbox" className="size-4 accent-[#637957]" checked={on} disabled={!on && picked.length >= MAX_COMPARE} onChange={() => setPicked((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))} />
                      {p.name}
                    </label>
                  );
                })}
              </div>
              {picked.length >= MAX_COMPARE ? <p className="mt-2 text-xs text-ink-soft">Maximum of {MAX_COMPARE} ponds selected.</p> : null}
            </fieldset>
          </Card>
          <Card aria-labelledby="cmp-table">
            <CardHeader id="cmp-table" title={`${PARAM_LABEL[parameter]} comparison`} description={compare.data?.range ? `${formatDateTime(compare.data.range.from)} to ${formatDateTime(compare.data.range.to)}` : undefined} />
            <div className="pt-3">
              {picked.length === 0 ? <EmptyState title="Select at least one pond" />
                : compare.loading && !compare.data ? <TableSkeleton rows={Math.min(picked.length, 4)} cols={6} />
                : compare.error ? <ErrorState error={compare.error} title="Could not load the comparison" onRetry={compare.reload} />
                : !compare.data || compare.data.ponds.length === 0 ? <EmptyState title="No data to compare">The selected ponds have no readings in this window.</EmptyState>
                : (
                  <Table caption={`${PARAM_LABEL[parameter]} statistics by pond`}>
                    <thead><tr><Th>Pond</Th><Th className="text-right">Readings</Th><Th className="text-right">Mean</Th><Th className="text-right">Minimum</Th><Th className="text-right">Maximum</Th><Th className="text-right">Latest in window</Th></tr></thead>
                    <tbody>
                      {[...compare.data.ponds].sort((a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity)).map((r) => (
                        <Tr key={r.pondId}>
                          <Td className="font-medium">{r.name}</Td><Td className="text-right tabular-nums">{r.count}</Td>
                          <Td className="text-right tabular-nums">{r.count ? fmt(r.mean, parameter, r.unit) : <span className="text-ink-soft">no readings</span>}</Td>
                          <Td className="text-right tabular-nums">{r.count ? fmt(r.min, parameter, r.unit) : 'n/a'}</Td><Td className="text-right tabular-nums">{r.count ? fmt(r.max, parameter, r.unit) : 'n/a'}</Td>
                          <Td className="text-right tabular-nums">{r.count ? fmt(r.lastValue, parameter, r.unit) : 'n/a'}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              <p className="px-5 pb-5 pt-3 text-xs text-ink-soft">Sorted by mean, lowest first. Statistics cover only the selected window of recorded readings, and ponds are not directly comparable if they were recorded over different periods.</p>
            </div>
          </Card>
          {picked.length > 0 && compareEnd === null ? <Notice tone="warning">None of the selected ponds has any recorded reading.</Notice> : null}
        </>
      )}
    </div>
  );
}
