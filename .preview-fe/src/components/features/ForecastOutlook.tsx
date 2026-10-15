import { Binoculars } from '@phosphor-icons/react/dist/ssr';
import type { ParamSummary, Prediction } from '@/lib/api/schemas';
import { ALERT_PARAMETERS, PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, PARAM_LABEL, SOURCE_LABEL, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { FORECAST_SLOTS, describeForecastProblem, describeProblem, horizonWords, trendOf, trendSentence } from '@/lib/terms';
import { EmptyState } from '../ui/states';
import { cx } from '../ui/cx';

const RANK = { NORMAL: 0, WARNING: 1, CRITICAL: 2 } as const;

/**
 * "What may happen next": for each factor, now and the model's forecast for 15 minutes, 1 hour and 3 hours ahead.
 * Forecast cells are dashed and labelled so they cannot be mistaken for readings; whether a forecast value is a problem comes from
 * the API's own classification (`risk`), never from thresholds in the browser.
 */
export function ForecastOutlook({ predictions, readings, columns = 3 }: { predictions: Prediction[]; readings: Record<string, ParamSummary>; columns?: 1 | 3 }) {
  if (!predictions.length) {
    return <EmptyState title="No forecast yet">A forecast is calculated when a new reading arrives and the pond has at least 24 hours of earlier readings. None is available for this pond right now.</EmptyState>;
  }
  const generatedAt = predictions.map((p) => p.generatedAt).sort().at(-1)!;
  const simulated = predictions.some((p) => p.dataSource === 'simulated');
  const historical = predictions.some((p) => p.dataSource === 'historical');
  // A forecast is "as of" the reading it was calculated from. Only compare it with NOW when that is the latest reading.
  const first = predictions.find((p) => p.horizon?.value !== undefined);
  const startedAt = first ? Date.parse(first.forecastFor) - (first.horizon?.value ?? 0) * 60_000 : null;
  const aligned = (r?: ParamSummary) => Boolean(r && startedAt !== null && Math.abs(Date.parse(r.recordedAt) - startedAt) <= 20 * 60_000);
  const olderBase = startedAt !== null && Object.values(readings).some((r) => !aligned(r));
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-1 rounded-full bg-sage-pale px-2.5 py-0.5 text-xs font-medium text-olive-text"><Binoculars size={14} aria-hidden="true" />Forecast</span>
        These are calculated estimates, not measurements. Calculated {formatDateTime(generatedAt)}.
      </p>
      {olderBase && startedAt !== null ? <p className="rounded-lg bg-surface px-3 py-2 text-[13px] text-ink-soft">This forecast was calculated from the reading at {formatDateTime(new Date(startedAt).toISOString())}, which is not the latest reading, so it is not compared with the values now.</p> : null}
      {simulated ? <p className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-text">This forecast started from a test reading ({SOURCE_LABEL.simulated.toLowerCase()}), so it does not describe the real pond.</p> : null}
      {historical && !simulated ? <p className="rounded-lg bg-surface px-3 py-2 text-[13px] text-ink-soft">This forecast started from {SOURCE_LABEL.historical.toLowerCase()}, not from a live sensor.</p> : null}
      <div className={cx('grid grid-cols-1 gap-4', columns === 3 && 'lg:grid-cols-3')}>
        {ALERT_PARAMETERS.map((p) => {
          const preds = predictions.filter((x) => x.parameter === p);
          const Icon = PARAM_ICON[p];
          const now = aligned(readings[p]) ? readings[p] : undefined;
          const bySlot = (m: number) => preds.find((x) => x.horizon?.value === m);
          const last = [...FORECAST_SLOTS].reverse().map((s) => bySlot(s.minutes)).find(Boolean);
          const firstBad = FORECAST_SLOTS.map((s) => bySlot(s.minutes)).find((x) => x && (x.risk === 'WARNING' || x.risk === 'CRITICAL'));
          const unit = unitLabel(last?.unit ?? now?.unit) || DEFAULT_UNIT[p];
          const ref = bySlot(60) ?? last;
          return (
            <section key={p} aria-label={`${PARAM_LABEL[p]} forecast`} className="rounded-xl border border-line bg-card p-4">
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">{Icon ? <Icon size={16} aria-hidden="true" /> : null}{PARAM_LABEL[p]}</h3>
              {last && now ? <p className="mt-1 text-[15px] font-medium text-ink">{trendSentence(p, trendOf(now.value, last.predictedValue, last.typicalAbsError))}</p> : <p className="mt-1 text-[15px] text-ink-soft">{preds.length ? 'No matching current reading to compare with.' : 'No forecast for this factor.'}</p>}
              <ol className="mt-3 grid grid-cols-4 gap-2 text-center text-xs" aria-label={`${PARAM_LABEL[p]} now and forecast`}>
                <li className="rounded-lg bg-surface px-1 py-2"><p className="font-medium text-ink-soft">NOW</p><p className="mt-1 text-sm font-medium tabular-nums text-ink">{now ? formatValue(now.value, p) : 'n/a'}</p></li>
                {FORECAST_SLOTS.map((s) => { const x = bySlot(s.minutes); const bad = x && (x.risk === 'WARNING' || x.risk === 'CRITICAL'); return (
                  <li key={s.minutes} className={cx('rounded-lg border border-dashed px-1 py-2', bad ? 'border-warn-text/60 bg-warn-bg' : 'border-line')}>
                    <p className="font-medium text-ink-soft">{s.label.toUpperCase()}</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-ink">{x ? formatValue(x.predictedValue, p) : 'n/a'}</p>
                    {bad ? <p className={cx('mt-0.5 text-[11px] font-medium', x!.risk === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text')}>{x!.risk === 'CRITICAL' ? 'Critical' : 'Warning'}</p> : null}
                  </li>
                ); })}
              </ol>
              <p className="mt-1.5 text-[11px] text-ink-soft">{unit ? `Values in ${unit}. ` : ''}Dashed boxes are forecasts.</p>
              {firstBad ? (() => {
                const sev = firstBad.risk === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
                const nowRisk = now?.risk === 'CRITICAL' ? 'CRITICAL' : now?.risk === 'WARNING' ? 'WARNING' : 'NORMAL';
                const already = RANK[nowRisk] >= RANK[sev];   // it is a problem now, so the forecast is "continues", not "may become"
                return (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-text"><Binoculars size={16} className="mt-px shrink-0" aria-hidden="true" />
                    {already ? <span><span className="font-medium">Expected to continue:</span> {describeProblem(p, firstBad.direction, sev)} now, and the forecast says it will still be a problem within {horizonWords(last?.horizon?.value)}.</span>
                      : <span><span className="font-medium">Possible upcoming problem:</span> {describeForecastProblem(p, firstBad.direction, sev, firstBad.horizon?.value)}.</span>}
                  </p>
                );
              })() : preds.length ? <p className="mt-2 text-[13px] text-ink-soft">No problem is forecast for this factor.</p> : null}
              {ref?.typicalAbsError !== undefined ? <p className="mt-2 text-[11px] text-ink-soft">Forecasts like this are usually off by about ±{formatValue(ref.typicalAbsError, p)}{unit ? ` ${unit}` : ''}.</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
