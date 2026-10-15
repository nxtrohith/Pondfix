'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserApi } from '@/lib/api/client';
import type { WhatIfResult } from '@/lib/api/schemas';
import { PARAM_LABEL, formatValue } from '@/lib/format';
import { WHATIF_LABEL, WHATIF_PRESETS, WHATIF_UNIT, TIMES_OF_DAY, buildWhatIfRequest, emptyWhatIf, type Trend, type WhatIfErrors, type WhatIfInput } from '@/lib/whatif';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input, Segmented } from '../ui/Field';
import { StatusBadge } from '../ui/StatusBadge';
import { ErrorState } from '../ui/states';
import { cx } from '../ui/cx';
import { DownstreamRiskList } from './DownstreamRisks';

const TRENDS: { value: Trend; label: string }[] = [{ value: 'falling', label: 'Falling' }, { value: 'steady', label: 'Steady' }, { value: 'rising', label: 'Rising' }];
type Core = 'temperature' | 'dissolvedOxygen' | 'ph';
const CORE: { key: Core; trend: 'temperatureTrend' | 'dissolvedOxygenTrend' | 'phTrend'; hint: string }[] = [
  { key: 'temperature', trend: 'temperatureTrend', hint: 'Warm water holds less oxygen' },
  { key: 'dissolvedOxygen', trend: 'dissolvedOxygenTrend', hint: 'Usually lowest just before dawn' },
  { key: 'ph', trend: 'phTrend', hint: 'High pH makes ammonia more toxic' },
];
const STATUS_KEY: Record<Core, string> = { temperature: 'temperature', dissolvedOxygen: 'dissolved_oxygen', ph: 'ph' };

/**
 * "What if…": type or pick hypothetical conditions and see what PondFix would classify and what it would tell the farmer to watch for.
 * The backend does the work (the same rules the alert advisor uses); nothing is saved and no alert is created.
 */
export function WhatIfPlayground() {
  const [input, setInput] = useState<WhatIfInput>(() => emptyWhatIf());
  const [preset, setPreset] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const built = useMemo(() => buildWhatIfRequest(input), [input]);
  const errors: WhatIfErrors = built.ok ? {} : built.errors;
  // Invalid input hides the last result instead of clearing state from inside the effect.
  const shownResult = built.ok ? result : null; const shownError = built.ok ? error : null;
  const set = <K extends keyof WhatIfInput>(k: K, v: WhatIfInput[K]) => { setPreset(null); setInput((s) => ({ ...s, [k]: v })); };

  useEffect(() => {
    if (!built.ok) return undefined;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      browserApi().whatIf(built.body, ctl.signal).then((r) => { setResult(r); setError(null); }, (e) => { if (!ctl.signal.aborted) setError(e); });
    }, 250);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [built, retry]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card aria-labelledby="whatif-title">
        <CardHeader id="whatif-title" title="What if…" description="Pick a situation, or set the conditions yourself. Nothing is saved and no alert is created." />
        <CardBody className="space-y-5">
          <div>
            <p className="text-[13px] font-medium text-ink">Try a situation</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WHATIF_PRESETS.map((p) => (
                <Button key={p.id} size="sm" variant={preset === p.id ? 'primary' : 'secondary'} aria-pressed={preset === p.id} title={p.hint} onClick={() => { setInput(p.input); setPreset(p.id); }}>{p.label}</Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => { setInput(emptyWhatIf()); setPreset(null); }}>Reset</Button>
            </div>
          </div>

          <div className="space-y-4">
            {CORE.map(({ key, trend, hint }) => (
              <div key={key} className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="w-full sm:w-52"><Field label={`${WHATIF_LABEL[key]}${WHATIF_UNIT[key] ? ` (${WHATIF_UNIT[key]})` : ''}`} hint={hint} error={errors[key]}>
                  {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={input[key]} onChange={(e) => set(key, e.target.value)} />}
                </Field></div>
                <Segmented<Trend> label={`${WHATIF_LABEL[key]} trend`} value={input[trend]} onChange={(v) => set(trend, v)} options={TRENDS} />
              </div>
            ))}
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink">Time of day</p>
            <div className="mt-2"><Segmented<string> label="Time of day" value={String(input.hourIst)} onChange={(v) => set('hourIst', Number(v))} options={[...TIMES_OF_DAY]} /></div>
          </div>

          <details className="rounded-lg border border-line bg-surface px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-ink">Add other water chemistry (optional)</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['ammonia', 'nitrite', 'alkalinity'] as const).map((k) => (
                <Field key={k} label={`${WHATIF_LABEL[k]} (${WHATIF_UNIT[k]})`} error={errors[k]}>
                  {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" placeholder="not set" value={input[k]} onChange={(e) => set(k, e.target.value)} />}
                </Field>
              ))}
            </div>
          </details>
          {errors.form ? <p className="text-xs text-crit-text">{errors.form}</p> : null}
        </CardBody>
      </Card>

      <Card aria-labelledby="whatif-result-title" className="self-start">
        <CardHeader id="whatif-result-title" title="What PondFix would say" description="Based on the active alert limits and the watch-out rules. These are hypothetical." />
        <CardBody className="space-y-5" >
          <div aria-live="polite" className="space-y-5">
            {shownError ? <ErrorState error={shownError} title="Could not work this out" onRetry={() => setRetry((n) => n + 1)} />
              : !shownResult ? <p className="text-[13px] text-ink-soft">{built.ok ? 'Working it out…' : 'Fix the highlighted values to see the result.'}</p>
              : (
                <>
                  <section aria-label="Status of each value">
                    <h3 className="text-[13px] font-medium text-ink">Would any alert be raised?</h3>
                    <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                      {Object.entries(shownResult.status).map(([p, s]) => (
                        <li key={p} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                          <span className="text-ink">{PARAM_LABEL[p] ?? s.label} <span className="tabular-nums text-ink-soft">{formatValue(s.value, p)}</span></span>
                          <span className="flex items-center gap-2">
                            {s.direction ? <span className="text-xs text-ink-soft">{s.direction === 'high' ? 'above' : 'below'} the limit of {s.threshold}</span> : null}
                            <StatusBadge status={s.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                    {shownResult.derived.unionizedFractionPercent !== undefined ? (
                      <p className="mt-2 text-xs text-ink-soft">
                        At this pH and temperature about <span className="font-medium text-ink">{shownResult.derived.unionizedFractionPercent}%</span> of any ammonia is the toxic un-ionized form
                        {shownResult.derived.unIonizedAmmonia !== undefined ? <>, which here is <span className="font-medium text-ink">{shownResult.derived.unIonizedAmmonia} mg/L</span></> : null}.
                      </p>
                    ) : null}
                  </section>

                  <section aria-label="What to watch for">
                    <h3 className="text-[13px] font-medium text-ink">What to watch for</h3>
                    {shownResult.risks.length ? <div className="mt-2"><DownstreamRiskList risks={shownResult.risks} compact /></div>
                      : <p className={cx('mt-2 text-[13px] text-ink-soft')}>Nothing to watch for in this situation. That is not a guarantee: only the rules above were checked.</p>}
                  </section>
                  <p className="text-xs text-ink-soft">{shownResult.note}</p>
                </>
              )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
