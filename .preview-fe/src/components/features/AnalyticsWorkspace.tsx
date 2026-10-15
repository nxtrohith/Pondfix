'use client';
import { useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { breakGaps } from '@/lib/chart';
import { thresholdLines } from '@/lib/limits';
import { PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatValue, unitLabel, fmtThreshold } from '@/lib/format';
import type { TrendPond } from './MeasurementTrend';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select, Segmented } from '../ui/Field';
import { ChartSkeleton, TableSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { Table, Td, Th, Tr, STICKY_COL } from '../ui/Table';
import { cx } from '../ui/cx';
import { TrendChart, SERIES_COLOR, type Threshold } from '../charts/TrendChart';

const DAY = 86400_000;
const RANGES = { '24h': DAY, '3d': 3 * DAY, '7d': 7 * DAY, '30d': 30 * DAY } as const;
type RangeKey = keyof typeof RANGES;
/** Every parameter the analytics API serves for ponds. Each gets its own section, query and chart. */
export const ANALYTICS_PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
type P = (typeof ANALYTICS_PARAMS)[number];
const TITLE: Record<P, string> = { dissolved_oxygen: 'Dissolved oxygen', ph: 'pH', temperature: 'Water temperature' };
/** Name as written in a sentence: only pH keeps its capital. */
const NOUN: Record<P, string> = { dissolved_oxygen: 'dissolved oxygen', ph: 'pH', temperature: 'water temperature' };
const MAX_COMPARE = 6;

/** Number with its unit set apart in muted text, so values line up and units never compete with them. */
function Num({ v, p, unit, bold }: { v: number | undefined | null; p: string; unit?: string; bold?: boolean }) {
  if (v === undefined || v === null) return <span className="text-ink-soft">n/a</span>;
  const u = unitLabel(unit);
  return <span className={cx('tabular-nums', bold && 'font-semibold')}>{formatValue(v, p)}{u ? <span className="ml-1 text-xs font-normal text-ink-soft">{u}</span> : null}</span>;
}
/** Severity of one reading against the backend's own rules; undefined when no rule exists (nothing is invented). */
function severity(v: number | undefined | null, parameter: string, rules: RiskRules | null): 'critical' | 'warning' | 'normal' | undefined {
  if (v === undefined || v === null) return undefined;
  const r = rules?.parameters?.[parameter];
  if (r) {
    if ((r.lowCritical !== undefined && v < r.lowCritical) || (r.highCritical !== undefined && v > r.highCritical)) return 'critical';
    if ((r.lowWarning !== undefined && v < r.lowWarning) || (r.highWarning !== undefined && v > r.highWarning)) return 'warning';
    return r.lowWarning === undefined && r.highWarning === undefined && r.lowCritical === undefined && r.highCritical === undefined ? undefined : 'normal';
  }
  if (parameter === 'dissolved_oxygen' && rules) return v < rules.dissolvedOxygen.criticalBelow ? 'critical' : v < rules.dissolvedOxygen.warningBelow ? 'warning' : 'normal';
  return undefined;
}
/** Status is always a word plus an icon, never colour alone. */
function SeverityTag({ level }: { level?: 'critical' | 'warning' | 'normal' }) {
  if (level !== 'critical' && level !== 'warning') return null;
  const crit = level === 'critical';
  return (
    <span className={cx('ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', crit ? 'bg-crit-bg text-crit-text' : 'bg-warn-bg text-warn-text')}>
      <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="currentColor">{crit ? <path d="M8 1 15 14H1L8 1Zm-.75 5v4h1.5V6h-1.5Zm0 5v1.5h1.5V11h-1.5Z" /> : <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v4.5h-1.5V4.5Zm0 5.5h1.5v1.5h-1.5V10Z" />}</svg>
      {crit ? 'Critical' : 'Warning'}
    </span>
  );
}
const fmt = (v: number | undefined, p: string, unit?: string) => (v === undefined ? 'n/a' : formatValue(v, p, true, unit));
/** One parameter for one pond: stats from the API's own aggregation, chart of observed buckets, and an honest empty state. */
function ParameterSection({ parameter, pondId, pondName, end, range, bucket, rules }: { parameter: P; pondId: string; pondName: string; end: number | null; range: RangeKey; bucket: 'hour' | 'day'; rules: RiskRules | null }) {
  const q = useApiQuery(
    (signal) => browserApi().analytics(pondId, { parameter, from: new Date(end! - RANGES[range]).toISOString(), to: new Date(end!).toISOString(), bucket }, signal),
    [pondId, parameter, range, bucket, end], end !== null,
  );
  const sm = q.data?.summary; const u = sm?.unit;
  const series = useMemo(() => {
    const s = q.data?.series ?? [];
    const step = (bucket === 'hour' ? 3600_000 : DAY) * 2.5;
    const line = (pick: (b: (typeof s)[number]) => number) => breakGaps(s.map((b) => ({ t: Date.parse(b.bucketStart), v: pick(b) })), step);
    return [
      { key: 'mean', label: 'Mean', points: line((b) => b.mean), color: SERIES_COLOR.observed },
      { key: 'min', label: 'Minimum', points: line((b) => b.min), color: SERIES_COLOR.secondary, dashed: true },
      { key: 'max', label: 'Maximum', points: line((b) => b.max), color: SERIES_COLOR.muted, dashed: true },
    ];
  }, [q.data, bucket]);
  const label = TITLE[parameter]; const noun = NOUN[parameter];
  // pH is unitless, so no unit is shown for it; the other units come from the API response (fallback while loading).
  const unitText = unitLabel(u) || (u ? '' : parameter === 'dissolved_oxygen' ? 'mg/L' : parameter === 'temperature' ? '°C' : '');
  const headingUnit = unitText ? ` (${unitText})` : '';

  return (
    <Card aria-labelledby={`an-${parameter}`}>
      <CardHeader id={`an-${parameter}`} title={`${label}${headingUnit}`} description={q.data?.method ?? 'Observed readings only; nothing is estimated or interpolated.'} />
      <div className="px-5 pb-5 pt-4">
        {q.loading && !q.data ? <ChartSkeleton height={240} />
          : q.error ? <ErrorState error={q.error} title={`Could not load ${noun} analytics`} onRetry={q.reload} />
          : end === null ? <EmptyState title={`No ${noun} measurements`}>{pondName} has no recorded readings yet, so there is nothing to chart.</EmptyState>
          : !sm || sm.count === 0 ? <EmptyState title={`No ${noun} measurements in this period`}>{pondName} has no recorded {noun} readings in the selected window. Try a longer range. A missing reading is not shown as zero.</EmptyState>
          : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[['Observations', String(sm.count)], ['Average', fmt(sm.mean, parameter, u)], ['Minimum', fmt(sm.min, parameter, u)], ['Maximum', fmt(sm.max, parameter, u)],
                  ['Change over window', sm.change === undefined ? 'n/a' : `${sm.change > 0 ? '+' : ''}${formatValue(sm.change, parameter)} ${unitLabel(u)}`.trim()]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface px-3.5 py-3"><dt className="text-xs text-ink-soft">{k}</dt><dd className="mt-1 text-lg font-medium tabular-nums text-ink">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-4">
                <TrendChart series={series} parameter={parameter} unit={u} thresholds={thresholdLines(rules, parameter)} height={240} summaryLabel={`${label} ${bucket === 'hour' ? 'hourly' : 'daily'} mean, minimum and maximum for ${pondName}`} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                {sm.count} recorded readings from {formatDateTime(q.data?.range?.from)} to {formatDateTime(q.data?.range?.to)}. Source: {(sm.sources ?? []).map((s) => (s in SOURCE_LABEL ? SOURCE_LABEL[s as keyof typeof SOURCE_LABEL] : s)).join(', ') || 'n/a'}.
                {sm.slopePerHour !== null && sm.slopePerHour !== undefined ? ` Linear trend across the window: ${sm.slopePerHour > 0 ? '+' : ''}${formatValue(sm.slopePerHour, parameter)} ${unitLabel(u)} per hour (a description of this window, not a prediction).` : ''}
                {parameter !== 'dissolved_oxygen' ? ' No validated alert rule exists for this parameter.' : ''}
              </p>
            </>
          )}
      </div>
    </Card>
  );
}

function CompareSection({ parameter, pondIds, end, range, rules }: { parameter: P; pondIds: string[]; end: number | null; range: RangeKey; rules: RiskRules | null }) {
  const q = useApiQuery(
    (signal) => browserApi().compare({ parameter, from: new Date(end! - RANGES[range]).toISOString(), to: new Date(end!).toISOString(), pondIds: pondIds.join(',') }, signal),
    [pondIds.join(','), parameter, range, end], pondIds.length > 0 && end !== null,
  );
  const label = TITLE[parameter]; const noun = NOUN[parameter];
  const apiUnit = unitLabel(q.data?.ponds.find((r) => r.unit)?.unit);
  const unitText = apiUnit || (parameter === 'dissolved_oxygen' ? 'mg/L' : parameter === 'temperature' ? '°C' : '');
  return (
    <Card aria-labelledby={`cmp-${parameter}`} className="overflow-hidden">
      <CardHeader id={`cmp-${parameter}`} title={`${label} comparison${unitText ? ` (${unitText})` : ''}`} description={q.data?.range ? `${formatDateTime(q.data.range.from)} to ${formatDateTime(q.data.range.to)}` : undefined} />
      <div className="mt-4 border-t border-line">
        {pondIds.length === 0 ? <EmptyState title="Select at least one pond" />
          : q.loading && !q.data ? <TableSkeleton rows={Math.min(pondIds.length, 3)} cols={6} />
          : q.error ? <ErrorState error={q.error} title={`Could not load the ${noun} comparison`} onRetry={q.reload} />
          : !q.data || q.data.ponds.every((r) => r.count === 0) ? <EmptyState title={`No ${noun} measurements to compare`}>The selected ponds have no recorded {noun} readings in this window.</EmptyState>
          : (
            <Table caption={`${label} statistics by pond`}>
              <thead><tr><Th className={cx('min-w-40', STICKY_COL)}>Pond</Th><Th className="text-right">Observations</Th><Th className="text-right">Average</Th><Th className="text-right">Minimum</Th><Th className="text-right">Maximum</Th><Th className="text-right">Latest in window</Th></tr></thead>
              <tbody>
                {[...q.data.ponds].sort((a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity)).map((r) => {
                  const has = r.count > 0; const sev = has ? severity(r.lastValue, parameter, rules) : undefined;
                  return (
                    <Tr key={r.pondId}>
                      <Td className={cx('max-w-56 font-semibold', STICKY_COL)}><span className="flex items-center gap-2"><span aria-hidden className="size-2 shrink-0 rounded-full bg-sage" /><span className="truncate" title={r.name}>{r.name}</span></span></Td>
                      <Td className="text-right tabular-nums">{r.count}</Td>
                      <Td className="text-right">{has ? <Num v={r.mean} p={parameter} unit={r.unit} /> : <span className="text-ink-soft">no readings</span>}</Td>
                      <Td className="text-right">{has ? <Num v={r.min} p={parameter} unit={r.unit} /> : <span className="text-ink-soft">n/a</span>}</Td>
                      <Td className="text-right">{has ? <Num v={r.max} p={parameter} unit={r.unit} /> : <span className="text-ink-soft">n/a</span>}</Td>
                      <Td className={cx('whitespace-nowrap text-right', sev === 'critical' && 'shadow-[inset_3px_0_0_var(--color-crit)]', sev === 'warning' && 'shadow-[inset_3px_0_0_var(--color-warn)]')}>
                        {has ? <><SeverityTag level={sev} /><span className="ml-2"><Num v={r.lastValue} p={parameter} unit={r.unit} bold /></span></> : <span className="text-ink-soft">n/a</span>}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        <p className="px-5 pb-5 pt-3 text-xs text-ink-soft">Sorted by average, lowest first. Warning and critical tags apply to the latest reading only, using the configured limits; minimum and maximum are history, not current conditions. Statistics cover only the selected window of recorded readings. Ponds without readings in the window are listed as &quot;no readings&quot;, never as zero.</p>
      </div>
    </Card>
  );
}

export function AnalyticsWorkspace({ ponds, initialPondId, rules }: { ponds: TrendPond[]; initialPondId: string; rules: RiskRules | null }) {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [range, setRange] = useState<RangeKey>('7d');
  const [bucketPref, setBucketPref] = useState<'auto' | 'hour' | 'day'>('auto');
  const [pondId, setPondId] = useState(initialPondId);
  const [picked, setPicked] = useState<string[]>(() => ponds.slice(0, 3).map((p) => p.id));

  const bucket: 'hour' | 'day' = bucketPref === 'auto' ? (RANGES[range] <= 7 * DAY ? 'hour' : 'day') : bucketPref;
  const pond = ponds.find((p) => p.id === pondId);
  const endFor = (list: (TrendPond | undefined)[]) => { const t = list.map((p) => (p?.latestAt ? Date.parse(p.latestAt) : NaN)).filter(Number.isFinite); return t.length ? Math.max(...t) : null; };
  const singleEnd = endFor([pond]);
  const compareEnd = endFor(picked.map((id) => ponds.find((p) => p.id === id)));
  const windowEnd = mode === 'single' ? singleEnd : compareEnd;

  if (!ponds.length) return <Card><EmptyState title="No ponds available">Comparing needs recorded readings. Import or register ponds first.</EmptyState></Card>;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="an-ctl">
        <CardHeader id="an-ctl" title="Compare ponds over time" description="Dissolved oxygen, pH and water temperature are shown together. Statistics are calculated by the API from recorded readings only." />
        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Segmented label="View" value={mode} onChange={setMode} options={[{ value: 'single', label: 'Single pond' }, { value: 'compare', label: 'Compare ponds' }]} />
            <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 h' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />
          </div>
          {mode === 'single' ? (
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full sm:w-60"><Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field></div>
              <div className="w-full sm:w-44"><Field label="Detail level">{(id) => <Select id={id} value={bucketPref} onChange={(e) => setBucketPref(e.target.value as typeof bucketPref)}><option value="auto">Automatic</option><option value="hour">Hourly</option><option value="day">Daily</option></Select>}</Field></div>
            </div>
          ) : null}
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">The time window ends at the latest recorded reading of the selected pond{mode === 'compare' ? 's' : ''}{windowEnd ? ` (${formatDateTime(new Date(windowEnd).toISOString())})` : ''}, so historical ponds are not shown as empty. This is recorded data, not current conditions.</p>
      </Card>

      {mode === 'single' ? (
        ANALYTICS_PARAMS.map((p) => <ParameterSection key={p} parameter={p} pondId={pondId} pondName={pond?.name ?? 'This pond'} end={singleEnd} range={range} bucket={bucket} rules={rules} />)
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
          {picked.length > 0 && compareEnd === null ? <Notice tone="warning">None of the selected ponds has any recorded reading.</Notice> : null}
          {ANALYTICS_PARAMS.map((p) => <CompareSection key={p} parameter={p} pondIds={picked} end={compareEnd} range={range} rules={rules} />)}
        </>
      )}
    </div>
  );
}
