'use client';
import { useEffect } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxisTime, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { axisTicks, chartDomain, summarize, type Point } from '@/lib/chart';

export interface Series { key: string; label: string; points: Point[]; color: string; dashed?: boolean; dotsOnly?: boolean; hideLegend?: boolean }
export interface Threshold { y: number; label: string; tone: 'warn' | 'crit' }

const TONE = { warn: '#B86E00', crit: '#C0392B' } as const;
export const SERIES_COLOR = { observed: '#0F6B66', secondary: '#6FA59C', forecast: '#B86E00', muted: '#8E9A9B' } as const;

interface Props { /** Vertical marker (e.g. the replay position), ms since epoch. */ cursorAt?: number; series: Series[]; parameter: string; unit?: string; thresholds?: Threshold[]; height?: number; domain?: [number, number]; summaryLabel: string;
  /** Called with the hovered time (ms) while the pointer is over the chart, and null when it leaves. Lets stacked charts share one cursor. */
  onCursor?: (t: number | null) => void;
  /** Hide the legend (for stacked charts that explain the line styles once, elsewhere). */
  compact?: boolean }

export function TrendChart({ cursorAt, onCursor, compact = false, series, parameter, unit, thresholds = [], height = 280, domain, summaryLabel }: Props) {
  const all = series.flatMap((s) => s.points.filter((p): p is { t: number; v: number } => p.v !== null));
  const [t0, t1] = chartDomain(all.map((p) => p.t), domain);
  const span = Math.max(t1 - t0, 1);
  const sum = summarize(all);
  const u = unitLabel(unit);

  return (
    <figure aria-label={summaryLabel} className="m-0">
      <figcaption className="sr-only">
        {summaryLabel}. {sum ? `${sum.count} points from ${formatDateTime(new Date(sum.first.t).toISOString())} to ${formatDateTime(new Date(sum.last.t).toISOString())}, minimum ${formatValue(sum.min, parameter, true, unit)}, maximum ${formatValue(sum.max, parameter, true, unit)}.` : 'No data points.'}
      </figcaption>
      {u ? <p className="mb-1 text-xs text-ink-soft" aria-hidden="true">Unit: {u}</p> : null}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height }}>
          <ComposedChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#DEDAD0" strokeDasharray="0" vertical={false} />
            <XAxis type="number" dataKey="t" domain={[t0, t1]} scale="time" ticks={axisTicks(t0, t1, 5)} tickFormatter={(v: number) => formatAxisTime(v, span)} tick={{ fill: '#4A5A5C', fontSize: 12 }} axisLine={{ stroke: '#DEDAD0' }} tickLine={false} allowDuplicatedCategory={false} padding={{ left: 16, right: 16 }} />
            <YAxis type="number" domain={['auto', 'auto']} width={compact ? 58 : 44} tick={{ fill: '#4A5A5C', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatValue(v, parameter)} />
            {cursorAt !== undefined && cursorAt >= t0 && cursorAt <= t1 ? <ReferenceLine x={cursorAt} stroke="#17282A" strokeWidth={1.25} ifOverflow="visible" /> : null}
            {thresholds.map((th) => (
              <ReferenceLine key={th.label} y={th.y} stroke={TONE[th.tone]} strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain" />
            ))}
            <Tooltip cursor={{ stroke: '#C5C0B3', strokeWidth: 1 }} content={<ChartTooltip parameter={parameter} unit={unit} onCursor={onCursor} />} isAnimationActive={false} />
            {series.map((s) => (
              <Line
                key={s.key}
                name={s.label}
                data={s.points}
                dataKey="v"
                type="linear"
                stroke={s.dotsOnly ? 'none' : s.color}
                strokeWidth={1.75}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                // A line needs two points; with fewer, show the point itself so a lone reading is never invisible.
                dot={s.dotsOnly ? { r: 4, fill: '#ffffff', stroke: s.color, strokeWidth: 1.75 } : s.points.filter((p) => p.v !== null).length <= 2 ? { r: 3.5, fill: s.color, stroke: s.color } : false}
                activeDot={{ r: 4, fill: s.color, stroke: '#ffffff', strokeWidth: 1.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!compact && (series.filter((s) => !s.hideLegend).length > 1 || thresholds.length) ? (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-ink-soft" aria-label="Chart legend">
          {series.filter((s) => !s.hideLegend).map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-0 w-5 border-t-2" style={{ borderColor: s.color, borderTopStyle: s.dashed || s.dotsOnly ? 'dashed' : 'solid' }} />
              {s.label}
            </li>
          ))}
          {thresholds.map((th) => (
            <li key={th.label} className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0 w-5 border-t border-dashed" style={{ borderColor: TONE[th.tone] }} />{th.label}</li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

interface TipProps { active?: boolean; payload?: { name?: string; value?: number | null; color?: string; stroke?: string; payload?: { t: number } }[]; parameter: string; unit?: string; onCursor?: (t: number | null) => void }
function ChartTooltip({ active, payload, parameter, unit, onCursor }: TipProps) {
  const rows = (payload ?? []).filter((p) => typeof p.value === 'number');
  const t = active && rows.length ? rows[0]!.payload?.t : undefined;
  useEffect(() => {
    if (!onCursor || t === undefined) return undefined;
    onCursor(t);
    return () => onCursor(null);
  }, [onCursor, t]);
  if (!active || !rows.length) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-[0_2px_8px_rgba(52,55,47,0.08)]">
      {t !== undefined ? <p className="mb-1 font-medium text-ink">{formatDateTime(new Date(t).toISOString())}</p> : null}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-ink-soft">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: r.stroke && r.stroke !== 'none' ? r.stroke : r.color }} />
          {r.name}: <span className="font-medium tabular-nums text-ink">{formatValue(r.value as number, parameter, true, unit)}</span>
        </p>
      ))}
    </div>
  );
}
