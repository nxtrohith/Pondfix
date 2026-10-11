'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { browserApi, ApiError } from '@/lib/api/client';
import type { IngestResponse, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { buildSimRequest, isoToUtcInput, type Scenario } from '@/lib/simulation';
import { fmtThreshold, formatAge, formatDateTime, formatValue } from '@/lib/format';
import { RISK_LABEL, RISK_TONE } from '@/lib/status';
import type { TrendPond } from './MeasurementTrend';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Field';
import { Button, linkButtonClass } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorState, Notice } from '../ui/states';
import { SourceBadge, StatusPill } from '../ui/StatusPill';
import { Skeleton } from '../ui/Skeleton';
import { cx } from '../ui/cx';

const SCENARIO_COPY: Record<Scenario, { label: string; text: string }> = {
  healthy: { label: 'Healthy', text: 'Dissolved oxygen above the warning limit' },
  warning: { label: 'Warning', text: 'Between the critical and warning limits' },
  critical: { label: 'Critical', text: 'Below the critical limit' },
};
const ACTION_TEXT: Record<string, string> = { opened: 'Opened a new alert', updated: 'Updated the open alert', escalated: 'Escalated the open alert', resolved: 'Resolved the open alert', none: 'No alert change' };
const INFERENCE_TEXT: Record<string, string> = {
  ok: 'Forecasts were generated and stored.',
  insufficient_history: 'No forecast: the model needs at least 24 hours of earlier readings for this pond and time.',
  unavailable: 'No forecast: the forecasting service was unavailable. The reading and alerts were still saved.',
  disabled: 'Forecasting is disabled on this server.',
  skipped: 'Forecasting was skipped for this reading.',
};

export function SimulationForm({ ponds, rules }: { ponds: TrendPond[]; rules: RiskRules | null }) {
  const api = useMemo(() => browserApi(), []);
  const scen = useApiQuery((s) => api.demoScenarios(s), []);
  const [pondId, setPondId] = useState(ponds[0]?.id ?? '');
  const [mode, setMode] = useState<'scenario' | 'custom'>('scenario');
  const [scenario, setScenario] = useState<Scenario>('critical');
  const [customDo, setCustomDo] = useState('');
  const [useNow, setUseNow] = useState(true);
  const [recordedAtInput, setRecordedAtInput] = useState('');
  const [errors, setErrors] = useState<{ doValue?: string; recordedAt?: string; pond?: string }>({});
  const [confirm, setConfirm] = useState<ReturnType<typeof buildSimRequest> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const pond = ponds.find((p) => p.id === pondId);
  const preview = buildSimRequest({ pondId, mode, scenario, customDo, useNow, recordedAtInput });
  const doValue = mode === 'scenario' ? scen.data?.scenarios[scenario]?.dissolved_oxygen : preview.ok ? preview.body.dissolvedOxygen : undefined;

  function request() {
    setResult(null); setFailure(null);
    const built = buildSimRequest({ pondId, mode, scenario, customDo, useNow, recordedAtInput });
    if (!built.ok) { setErrors(built.errors); return; }
    setErrors({}); setConfirm(built);
  }
  async function run() {
    if (!confirm?.ok) return;
    setBusy(true);
    try { setResult(await api.demoMeasurement(confirm.body)); setConfirm(null); }
    catch (e) { setFailure(e); setConfirm(null); }
    finally { setBusy(false); }
  }

  if (scen.loading && !scen.data) return <Card className="p-5"><Skeleton className="h-6 w-56" /><Skeleton className="mt-4 h-40 w-full" /></Card>;
  if (scen.error instanceof ApiError && scen.error.status === 404) return <Card><div className="px-6 py-12 text-center"><p className="text-sm font-medium">Simulation is disabled on this server</p><p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-ink-soft">The backend only exposes demo endpoints when demo mode is enabled (it is off in production by default). Set <code className="font-mono text-xs">DEMO_ENABLED=true</code> on the API to use this page.</p></div></Card>;
  if (scen.error) return <Card><ErrorState error={scen.error} title="Could not check simulation availability" onRetry={scen.reload} /></Card>;

  return (
    <div className="space-y-6">
      <Notice tone="warning"><strong className="font-medium">This page saves test data.</strong> A simulation stores a real record marked &quot;Simulated&quot;, can open or resolve alerts, and can create forecasts. It never changes anything until you confirm. There is no delete action, so saved simulated readings remain in the database.</Notice>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card aria-labelledby="sim-form">
          <CardHeader id="sim-form" title="Simulated reading" description="Submits one dissolved-oxygen reading through the same pipeline as a sensor reading." />
          <form className="space-y-5 px-5 pb-5 pt-4" onSubmit={(e) => { e.preventDefault(); request(); }} noValidate>
            <Field label="Pond" error={errors.pond}>{(id, d) => <Select id={id} aria-describedby={d} value={pondId} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink">Dissolved oxygen</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Scenario">
                {(Object.keys(SCENARIO_COPY) as Scenario[]).map((k) => {
                  const on = mode === 'scenario' && scenario === k;
                  return (
                    <label key={k} className={cx('flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-[13px] transition-colors duration-150', on ? 'border-olive bg-sage-pale' : 'border-line bg-card hover:bg-surface')}>
                      <span className="flex items-center gap-2"><input type="radio" name="scenario" className="accent-[#637957]" checked={on} onChange={() => { setMode('scenario'); setScenario(k); }} /><span className="font-medium text-ink">{SCENARIO_COPY[k].label}</span><span className="ml-auto tabular-nums text-ink-soft">{scen.data?.scenarios[k]?.dissolved_oxygen} mg/L</span></span>
                      <span className="mt-1 pl-6 text-xs text-ink-soft">{SCENARIO_COPY[k].text}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3">
                <label className={cx('flex cursor-pointer items-center gap-2 text-[13px]', mode === 'custom' ? 'text-ink' : 'text-ink-soft')}>
                  <input type="radio" name="scenario" className="accent-[#637957]" checked={mode === 'custom'} onChange={() => setMode('custom')} />Custom value
                </label>
                <div className="mt-2 max-w-[220px]">
                  <Field label="Dissolved oxygen (mg/L)" hint="Between 0 and 50" error={errors.doValue}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" disabled={mode !== 'custom'} value={customDo} onChange={(e) => setCustomDo(e.target.value)} placeholder="e.g. 2.4" />}</Field>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink">Reading time</legend>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[#637957]" checked={useNow} onChange={(e) => setUseNow(e.target.checked)} />Use the current time</label>
              {!useNow ? (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-60"><Field label="Reading time (UTC)" hint="Date and time in UTC" error={errors.recordedAt}>{(id, d) => <Input id={id} aria-describedby={d} type="datetime-local" value={recordedAtInput} onChange={(e) => setRecordedAtInput(e.target.value)} />}</Field></div>
                  {pond?.latestAt ? <Button size="sm" onClick={() => setRecordedAtInput(isoToUtcInput(new Date(Date.parse(pond.latestAt!) - 3 * 86400_000).toISOString()))}>Use a time inside this pond&apos;s history</Button> : null}
                </div>
              ) : null}
              {!useNow ? <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-ink-soft">A past time inside a pond&apos;s recorded history lets the model forecast from that point. The simulated value is then added to the real history around it, so the forecast reflects a mix of real and simulated data and is labelled as simulated.</p> : null}
            </fieldset>

            <div className="flex items-center gap-3 pt-1">
              <Button variant="primary" type="submit">Review and run simulation</Button>
              <p className="text-xs text-ink-soft">You will be asked to confirm before anything is saved.</p>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="sim-prev" className="self-start">
            <CardHeader id="sim-prev" title="What will be submitted" description="Nothing is sent yet." />
            <dl className="space-y-3 px-5 pb-5 pt-4 text-[13px]">
              {[
                ['Pond', pond?.name ?? 'n/a'],
                ['Dissolved oxygen', doValue === undefined ? 'n/a' : `${doValue} mg/L`],
                ['Reading time', useNow ? 'Now (set by the server)' : preview.ok && preview.body.recordedAt ? formatDateTime(preview.body.recordedAt) : 'Not set'],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-ink-soft">{k}</dt><dd className="text-right tabular-nums text-ink">{v}</dd></div>)}
              <div className="flex items-center justify-between gap-4"><dt className="text-ink-soft">Data source</dt><dd><SourceBadge source="simulated" /></dd></div>
              {rules && doValue !== undefined ? <p className="border-t border-line pt-3 text-xs text-ink-soft">Under the backend rules, {doValue} {rules.dissolvedOxygen.unit} is {doValue < rules.dissolvedOxygen.criticalBelow ? 'critical (below ' + fmtThreshold(rules.dissolvedOxygen.criticalBelow) + ')' : doValue < rules.dissolvedOxygen.warningBelow ? 'a warning (below ' + fmtThreshold(rules.dissolvedOxygen.warningBelow) + ')' : 'not a warning (at or above ' + fmtThreshold(rules.dissolvedOxygen.warningBelow) + ')'}. The server makes the final classification.</p> : null}
            </dl>
          </Card>

          <div aria-live="polite">
            {failure ? <Card><ErrorState error={failure} title="The simulation was not saved" onRetry={() => setFailure(null)} /></Card> : null}
            {result ? (
              <Card aria-labelledby="sim-res">
                <CardHeader id="sim-res" title="Result from the server" description={result.duplicate ? 'This reading was already saved.' : 'The simulated reading was saved.'} />
                <dl className="space-y-3 px-5 pb-5 pt-4 text-[13px]">
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Stored as</dt><dd className="flex items-center gap-2"><SourceBadge source={result.measurement.source} /></dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Reading time</dt><dd className="tabular-nums">{formatDateTime(result.measurement.recordedAt)}</dd></div>
                  {Object.entries(result.risk).map(([p, r]) => (
                    <div key={p} className="flex items-center justify-between gap-4"><dt className="text-ink-soft">Classification</dt><dd className="flex items-center gap-2"><span className="tabular-nums">{formatValue(r.value, p)} {r.unit}</span><StatusPill tone={RISK_TONE[(r.status === 'NORMAL' || r.status === 'WARNING' || r.status === 'CRITICAL' ? r.status : 'UNKNOWN')]}>{RISK_LABEL[(r.status === 'NORMAL' || r.status === 'WARNING' || r.status === 'CRITICAL' ? r.status : 'UNKNOWN')]}</StatusPill></dd></div>
                  ))}
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Alerts</dt><dd className="text-right">{result.alerts.length ? result.alerts.map((a) => ACTION_TEXT[a.action] ?? a.action).join(', ') : 'No alert change'}{!result.alertStateUpdated ? <span className="block text-xs text-ink-soft">Older than the newest reading, so alert state was not changed.</span> : null}</dd></div>
                  <div><dt className="text-ink-soft">Forecast</dt><dd className="mt-0.5">{INFERENCE_TEXT[result.inference.status] ?? result.inference.status}{result.inference.predictions ? ` (${result.inference.predictions} values)` : ''}</dd></div>
                  {result.inference.warnings?.length ? <div><dt className="text-ink-soft">Notes from the model</dt><dd className="mt-0.5 text-xs text-ink-soft">{result.inference.warnings.join(' ')}</dd></div> : null}
                </dl>
                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
                  <Link href={`/ponds/${result.measurement.pondId}`} className={linkButtonClass('secondary', 'sm')}>Open pond</Link>
                  <Link href="/alerts" className={linkButtonClass('secondary', 'sm')}>View alerts</Link>
                  <Link href={`/forecasts?pond=${result.measurement.pondId}`} className={linkButtonClass('secondary', 'sm')}>View forecasts</Link>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirm !== null && confirm.ok} title="Save this simulated reading?" confirmLabel="Save simulated reading" busy={busy} onConfirm={run} onCancel={() => !busy && setConfirm(null)}>
        <p>This permanently stores a reading for <strong className="font-medium text-ink">{pond?.name}</strong> with dissolved oxygen <strong className="font-medium text-ink">{doValue} mg/L</strong>, marked as simulated.</p>
        <p>It can open, update or resolve alerts for this pond and may create forecasts. It cannot be deleted from this interface.</p>
        {pond?.latestAt && !useNow ? <p className="text-xs">This pond&apos;s recorded history ends {formatAge(pond.latestAgeMinutes)}.</p> : null}
      </ConfirmDialog>
    </div>
  );
}
