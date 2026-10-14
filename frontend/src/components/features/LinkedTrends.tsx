'use client';
import { useCallback, useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { RANGE_MS, breakGaps, gapThreshold, splitBySource, type Point } from '@/lib/chart';
import { CHEMISTRY_PARAMETERS, DERIVED_PARAMETERS } from '@/lib/alerts';
import { thresholdLines } from '@/lib/limits';
import { PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { Card, CardHeader } from '../ui/Card';
import { Segmented } from '../ui/Field';
import { ChartSkeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/states';
import { cx } from '../ui/cx';
import { TrendChart, SERIES_COLOR } from '../charts/TrendChart';

type Range = '24h' | '7d';
const CORE = ['temperature', 'dissolved_oxygen', 'ph'] as const;
export const LINKED_OPTIONS: readonly string[] = [...CORE, 'un_ionized_ammonia', 'ammonia', 'nitrite', 'alkalinity', 'salinity', 'turbidity', 'nitrate'];
export const LINKED_DEFAULT = ['temperature', 'dissolved_oxygen', 'un_ionized_ammonia'];
export const LINKED_MAX = 4;
const PANEL_HEIGHT = 150;

/** Adds or removes `p`, keeping the picker order and never more than `max`. Pure so it can be tested. */
export function toggleParameter(selected: string[], p: string, max = LINKED_MAX): string[] {
  if (selected.includes(p)) return selected.length > 1 ? selected.filter((x) => x !== p) : selected;
  if (selected.length >= max) return selected;
  return LINKED_OPTIONS.filter((x) => x === p || selected.includes(x));
}

/** The point nearest in time to `t`, or null when there are no points. */
export function nearest(points: Point[], t: number): { t: number; v: number } | null {
  let best: { t: number; v: number } | null = null;
  for (const p of points) if (p.v !== null && (best === null || Math.abs(p.t - t) < Math.abs(best.t - t))) best = { t: p.t, v: p.v };
  return best;
}

function Panel({ pondId, parameter, latestAt, range, rules, cursor, onCursor }: { pondId: string; parameter: string; latestAt: string; range: Range; rules: RiskRules | null; cursor: number | null; onCursor: (t: number | null) => void }) {
  const to = Date.parse(latestAt); const from = to - RANGE_MS[range];
  const hourly = range === '7d';
  const chemistry = (CHEMISTRY_PARAMETERS as readonly string[]).includes(parameter);
  const q = useApiQuery(async (signal) => {
    const api = browserApi();
    if (hourly) {
      const r = await api.analytics(pondId, { parameter, from: new Date(from).toISOString(), to: new Date(to).toISOString(), bucket: 'hour' }, signal);
      return { unit: r.summary.unit, sources: r.summary.sources ?? [], line: r.series.map((b) => ({ t: Date.parse(b.bucketStart), v: b.mean })), dots: [] as { t: number; v: number }[] };
    }
    const r = await api.measurements(pondId, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), parameter, limit: 1000 }, signal);
    const s = splitBySource(r.items, parameter);
    const sources = [...new Set(r.items.filter((m) => m.values.some((v) => v.parameter === parameter)).map((m) => m.source))];
    // Water chemistry is entirely simulated or calculated, so it is drawn as a line (labelled), not as lone test dots.
    return chemistry ? { unit: s.unit, sources, line: [...s.recorded, ...s.simulated], dots: [] } : { unit: s.unit, sources, line: s.recorded, dots: s.simulated };
  }, [pondId, parameter, latestAt, range]);

  const d = q.data;
  const line = useMemo(() => (d ? breakGaps(d.line, hourly ? 3 * 3600_000 : gapThreshold(d.line.map((p) => p.t))) : []), [d, hourly]);
  const derived = DERIVED_PARAMETERS.includes(parameter);
  const tag = derived ? 'calculated' : chemistry ? 'test data' : null;
  const at = cursor !== null ? nearest(line, cursor) : null;
  const shown = at ?? (line.length ? nearest(line, to) : null);
  const u = unitLabel(d?.unit);

  return (
    <div className="border-t border-line px-5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[13px] font-medium text-ink">{PARAM_LABEL[parameter]}{tag ? <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal text-ink-soft">{tag}</span> : null}</p>
        {shown ? <p className={cx('text-[13px] tabular-nums', at ? 'text-ink' : 'text-ink-soft')} aria-live="off">
          {formatValue(shown.v, parameter)}{u ? <span className="ml-1 text-xs text-ink-soft">{u}</span> : null}
          <span className="ml-2 text-xs text-ink-soft">{at ? formatDateTime(new Date(shown.t).toISOString()) : 'latest'}</span>
        </p> : null}
      </div>
      {q.loading && !d ? <ChartSkeleton height={PANEL_HEIGHT} />
        : q.error ? <ErrorState error={q.error} title={`Could not load ${PARAM_LABEL[parameter]?.toLowerCase()}`} onRetry={q.reload} />
        : !d || (d.line.length === 0 && d.dots.length === 0) ? <p className="py-6 text-[13px] text-ink-soft">No {PARAM_LABEL[parameter]?.toLowerCase()} readings in this period. A missing reading is not shown as zero.</p>
        : (
          <TrendChart
            series={[
              { key: 'obs', label: `${PARAM_LABEL[parameter]}${hourly ? ' (hourly average)' : ''}`, points: line, color: SERIES_COLOR.observed, hideLegend: true },
              ...(d.dots.length ? [{ key: 'sim', label: SOURCE_LABEL.simulated, points: d.dots, color: SERIES_COLOR.forecast, dotsOnly: true, hideLegend: true }] : []),
            ]}
            parameter={parameter} unit={d.unit} height={PANEL_HEIGHT} domain={[from, to]} cursorAt={cursor ?? undefined} onCursor={onCursor} compact
            thresholds={thresholdLines(rules, parameter)} summaryLabel={`${PARAM_LABEL[parameter]}, ${range === '24h' ? 'last 24 hours' : 'last 7 days'}`}
          />
        )}
    </div>
  );
}

/**
 * Several readings stacked on one shared time axis with a linked cursor, so a farmer can see cause and effect (temperature up, then oxygen
 * down, then ammonia up). Every panel keeps its own scale: values are never rescaled or blended into one line.
 */
export function LinkedTrends({ pondId, latestAt, rules }: { pondId: string; latestAt: string | null; rules: RiskRules | null }) {
  const [selected, setSelected] = useState<string[]>(LINKED_DEFAULT);
  const [range, setRange] = useState<Range>('24h');
  const [cursor, setCursor] = useState<number | null>(null);
  const onCursor = useCallback((t: number | null) => setCursor(t), []);
  const ordered = LINKED_OPTIONS.filter((p) => selected.includes(p));

  return (
    <Card aria-labelledby="linked-title">
      <CardHeader id="linked-title" title="Compare readings" description={latestAt ? `Up to the last reading, ${formatDateTime(latestAt)}. Move over one chart and the others follow.` : 'No readings recorded yet.'}
        action={<Segmented<Range> label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }]} />} />
      <div className="px-5 pt-4">
        <p id="linked-pick" className="text-[13px] font-medium text-ink">Show up to {LINKED_MAX}</p>
        <div role="group" aria-labelledby="linked-pick" className="mt-2 flex flex-wrap gap-2">
          {LINKED_OPTIONS.map((p) => {
            const on = selected.includes(p); const full = !on && selected.length >= LINKED_MAX;
            return (
              <button key={p} type="button" aria-pressed={on} disabled={full} onClick={() => setSelected((s) => toggleParameter(s, p))}
                className={cx('h-7 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-40', on ? 'border-olive bg-sage-pale font-medium text-olive-text' : 'border-line bg-card text-ink-soft hover:text-ink')}>
                {PARAM_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 pb-3" onMouseLeave={() => setCursor(null)}>
        {latestAt ? ordered.map((p) => <Panel key={p} pondId={pondId} parameter={p} latestAt={latestAt} range={range} rules={rules} cursor={cursor} onCursor={onCursor} />)
          : <p className="px-5 py-6 text-[13px] text-ink-soft">Readings appear here once this pond has data.</p>}
      </div>
      <p className="px-5 pb-5 text-xs text-ink-soft">Each chart has its own scale. Dashed lines are alert limits (warning, then critical). Gaps mean no reading was recorded; nothing is filled in. Chemistry values are test data or calculated, and have no alert limits.</p>
    </Card>
  );
}
