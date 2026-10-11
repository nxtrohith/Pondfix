'use client';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxisTime, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { summarize, type Point } from '@/lib/chart';

export interface Series { key: string; label: string; points: Point[]; color: string; dashed?: boolean; dotsOnly?: boolean; hideLegend?: boolean }
export interface Threshold { y: number; label: string; tone: 'warn' | 'crit' }

const TONE = { warn: '#A66D25', crit: '#B64D43' } as const;
export const SERIES_COLOR = { observed: '#637957', secondary: '#7D9274', forecast: '#A66D25', muted: '#9a9c92' } as const;

interface Props { series: Series[]; parameter: string; unit?: string; thresholds?: Threshold[]; height?: number; domain?: [number, number]; summaryLabel: string }

export function TrendChart({ series, parameter, unit, thresholds = [], height = 280, domain, summaryLabel }: Props) {
  const all = series.flatMap((s) => s.points.filter((p): p is { t: number; v: number } => p.v !== null));
  const t0 = domain?.[0] ?? Math.min(...all.map((p) => p.t));
  const t1 = domain?.[1] ?? Math.max(...all.map((p) => p.t));
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
            <CartesianGrid stroke="#E5E3D9" strokeDasharray="0" vertical={false} />
            <XAxis type="number" dataKey="t" domain={[t0, t1]} scale="time" tickCount={5} minTickGap={36} tickFormatter={(v: number) => formatAxisTime(v, span)} tick={{ fill: '#6A6C62', fontSize: 12 }} axisLine={{ stroke: '#E5E3D9' }} tickLine={false} allowDuplicatedCategory={false} padding={{ left: 16, right: 16 }} />
            <YAxis type="number" domain={['auto', 'auto']} width={44} tick={{ fill: '#6A6C62', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatValue(v, parameter)} />
            {thresholds.map((th) => (
              <ReferenceLine key={th.label} y={th.y} stroke={TONE[th.tone]} strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain" />
            ))}
            <Tooltip cursor={{ stroke: '#B8B6AA', strokeWidth: 1 }} content={<ChartTooltip parameter={parameter} unit={unit} />} isAnimationActive={false} />
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
                dot={s.dotsOnly ? { r: 4, fill: '#ffffff', stroke: s.color, strokeWidth: 1.75 } : false}
                activeDot={{ r: 4, fill: s.color, stroke: '#ffffff', strokeWidth: 1.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {series.filter((s) => !s.hideLegend).length > 1 || thresholds.length ? (
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

interface TipProps { active?: boolean; payload?: { name?: string; value?: number | null; color?: string; stroke?: string; payload?: { t: number } }[]; parameter: string; unit?: string }
function ChartTooltip({ active, payload, parameter, unit }: TipProps) {
  const rows = (payload ?? []).filter((p) => typeof p.value === 'number');
  if (!active || !rows.length) return null;
  const t = rows[0]!.payload?.t;
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
