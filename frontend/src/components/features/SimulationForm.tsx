'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { browserApi, ApiError } from '@/lib/api/client';
import type { IngestResponse, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { useDbTarget } from '@/lib/useDbTarget';
import { SIM_BOUNDS, SIM_LABEL, SIM_PRESETS, SIM_UNIT, buildSimRequest, defaultSimInput, isoToUtcInput, type ParamInput, type Scenario, type SimErrors, type SimInput, type SimParam } from '@/lib/simulation';
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
import { AlertDemoRunner } from './AlertDemoRunner';
import { ParameterDemo } from './ParameterDemo';
import { acceptableText } from '@/lib/alerts';
import { RULE_SCOPE_LABEL, SAFETY_LABEL, speciesLine } from '@/lib/species';

const SCENARIO_LABEL: Record<Scenario, string> = { healthy: 'Healthy example', warning: 'Warning example', critical: 'Critical example' };
const ACTION_TEXT: Record<string, string> = { opened: 'Opened a new alert', updated: 'Updated the open alert', escalated: 'Escalated the open alert', resolved: 'Resolved the open alert', none: 'No alert change' };
const INFERENCE_TEXT: Record<string, string> = {
  ok: 'Forecasts were generated and stored.',
  insufficient_history: 'No forecast: the model needs at least 24 hours of earlier readings for this pond and time.',
  unavailable: 'No forecast: the forecasting service was unavailable. The reading and alerts were still saved.',
  disabled: 'Forecasting is disabled on this server.',
  skipped: 'Forecasting was skipped for this reading.',
};
const PARAM_ORDER: SimParam[] = ['dissolved_oxygen', 'ph', 'temperature'];

export function SimulationForm({ ponds, rules }: { ponds: TrendPond[]; rules: RiskRules | null }) {
  const api = useMemo(() => browserApi(), []);
  const scen = useApiQuery((s) => api.demoScenarios(s), []);
  const db = useDbTarget();
  const [input, setInput] = useState<SimInput>(() => defaultSimInput(ponds[0]?.id ?? ''));
  const [errors, setErrors] = useState<SimErrors>({});
  const [confirm, setConfirm] = useState<ReturnType<typeof buildSimRequest> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [sent, setSent] = useState<unknown>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const pond = ponds.find((p) => p.id === input.pondId);
  const preview = buildSimRequest(input);
  const setParam = (p: SimParam, patch: Partial<ParamInput>) => setInput((s) => ({ ...s, [p]: { ...s[p], ...patch } }));

  /** Rows describing what will be sent, derived from the same request builder that produces the HTTP body. */
  const previewRows = useMemo(() => {
    const rows: { param: SimParam; text: string }[] = [];
    if (!preview.ok) return rows;
    const b = preview.body;
    const doNum = b.scenario ? scen.data?.scenarios[b.scenario]?.dissolved_oxygen : b.dissolvedOxygen;
    if (doNum !== undefined) rows.push({ param: 'dissolved_oxygen', text: `${doNum} ${SIM_UNIT.dissolved_oxygen}${b.scenario ? ` (${SCENARIO_LABEL[b.scenario].toLowerCase()})` : ''}` });
    if (b.ph !== undefined) rows.push({ param: 'ph', text: `${b.ph}` });
    if (b.temperature !== undefined) rows.push({ param: 'temperature', text: `${b.temperature} ${SIM_UNIT.temperature}` });
    return rows;
  }, [preview, scen.data]);
  const doNumber = previewRows.find((r) => r.param === 'dissolved_oxygen') ? Number(previewRows.find((r) => r.param === 'dissolved_oxygen')!.text.split(' ')[0]) : undefined;

  function request() {
    setResult(null); setFailure(null);
    const built = buildSimRequest(input);
    if (!built.ok) { setErrors(built.errors); return; }
    setErrors({}); setConfirm(built);
  }
  async function run() {
    if (!confirm?.ok || !db.canWrite) return;
    setBusy(true); setSent(confirm.body);
    try { setResult(await api.demoMeasurement(confirm.body)); setConfirm(null); }
    catch (e) { setFailure(e); setConfirm(null); }
    finally { setBusy(false); }
  }

  if (scen.loading && !scen.data) return <Card className="p-5"><Skeleton className="h-6 w-56" /><Skeleton className="mt-4 h-40 w-full" /></Card>;
  if (scen.error instanceof ApiError && scen.error.status === 404) return <Card><div className="px-6 py-12 text-center"><p className="text-sm font-medium">Simulation is disabled on this server</p><p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-ink-soft">The backend only exposes demo endpoints when demo mode is enabled (it is off in production by default). Set <code className="font-mono text-xs">DEMO_ENABLED=true</code> on the API to use this page.</p></div></Card>;
  if (scen.error) return <Card><ErrorState error={scen.error} title="Could not check simulation availability" onRetry={scen.reload} /></Card>;

  return (
    <div className="space-y-6">
      <Notice tone="warning"><strong className="font-medium">This page saves test data.</strong> A simulation stores a real record marked &quot;Simulated&quot;, can open or resolve dissolved-oxygen, pH and temperature alerts, and can create forecasts. Nothing changes until you confirm, and it only runs against a local test database. There is no delete action, so saved simulated readings remain in that database.</Notice>
      {!db.loading && !db.canWrite ? <Notice tone="warning"><strong className="font-medium">Simulation is disabled.</strong> {db.error ? 'The API\'s database could not be checked.' : db.target === 'remote' ? 'This API is connected to a remote database, so a simulation would write test records there.' : 'This API did not report which database it uses.'} Stop it and start the isolated one with <code className="font-mono text-xs">npm run dev:local</code>.</Notice> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5"><p className="text-sm font-medium text-ink">Simulated reading</p><p className="mt-1 text-[13px] leading-relaxed text-ink-soft">One reading with dissolved oxygen, pH and temperature, sent as a single request. Use the form further down. Each parameter is checked against its own alert rule.</p></Card>
        <Card className="p-5"><p className="text-sm font-medium text-ink">Guided alert demo</p><p className="mt-1 text-[13px] leading-relaxed text-ink-soft">Four dissolved-oxygen readings in sequence (3.5, 2.5, 1.5, 3.5 mg/L) that open, escalate and resolve one alert. It sends dissolved oxygen only.</p></Card>
      </div>

      <AlertDemoRunner ponds={ponds} />
      <ParameterDemo ponds={ponds} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card aria-labelledby="sim-form">
          <CardHeader id="sim-form" title="Simulated reading: DO, pH and temperature" description="Choose an example or enter your own value for each parameter. All included values are saved together in one reading." />
          <form className="space-y-5 px-5 pb-5 pt-4" onSubmit={(e) => { e.preventDefault(); request(); }} noValidate>
            <Field label="Pond" error={errors.pond}>{(id, d) => <Select id={id} aria-describedby={d} value={input.pondId} onChange={(e) => setInput((s) => ({ ...s, pondId: e.target.value }))}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-ink">Values</legend>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {PARAM_ORDER.map((p) => {
                  const v = input[p]; const [lo, hi] = SIM_BOUNDS[p]; const err = errors[p];
                  return (
                    <div key={p} className={cx('rounded-lg border p-3.5', v.include ? 'border-line bg-card' : 'border-line bg-surface/60')}>
                      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
                        <input type="checkbox" className="size-4 accent-[#637957]" checked={v.include} onChange={(e) => setParam(p, { include: e.target.checked })} />
                        {SIM_LABEL[p]} <span className="font-normal text-ink-soft">({SIM_UNIT[p]})</span>
                      </label>
                      <div className="mt-3 space-y-2.5">
                        <Field label="Value">
                          {(id) => (
                            <Select id={id} disabled={!v.include} value={v.choice} onChange={(e) => setParam(p, { choice: e.target.value })}>
                              {p === 'dissolved_oxygen'
                                ? (['healthy', 'warning', 'critical'] as Scenario[]).map((k) => <option key={k} value={k}>{SCENARIO_LABEL[k]} ({scen.data?.scenarios[k]?.dissolved_oxygen} mg/L)</option>)
                                : SIM_PRESETS[p].map((n) => <option key={n} value={String(n)}>{n} {SIM_UNIT[p] === 'pH' ? 'pH' : SIM_UNIT[p]} (example)</option>)}
                              <option value="custom">Custom value</option>
                            </Select>
                          )}
                        </Field>
                        {v.choice === 'custom' ? (
                          <Field label={`Custom ${SIM_LABEL[p].toLowerCase()} (${SIM_UNIT[p]})`} hint={`Between ${lo} and ${hi}`} error={err}>
                            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" disabled={!v.include} value={v.custom} onChange={(e) => setParam(p, { custom: e.target.value })} placeholder={p === 'ph' ? 'e.g. 7.4' : p === 'temperature' ? 'e.g. 28' : 'e.g. 2.4'} />}
                          </Field>
                        ) : err ? <p role="alert" className="text-xs text-crit-text">{err}</p> : null}
                      </div>
                      <p className="mt-2.5 text-xs leading-snug text-ink-soft">
                        {rules?.parameters?.[p] ? `Acceptable ${acceptableText(rules.parameters[p]!)}. Outside it is a warning; beyond the critical limit is critical.${rules.parameters[p]!.source === 'provisional_demo' ? ' Provisional demo limits.' : ''}` : p === 'dissolved_oxygen' && rules ? `Alerts: below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)} is critical, ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)} to ${fmtThreshold(rules.dissolvedOxygen.warningBelow)} is a warning.` : 'Alert rules unavailable. The server makes the classification.'}
                      </p>
                    </div>
                  );
                })}
              </div>
              {errors.include ? <p role="alert" className="mt-2 text-xs text-crit-text">{errors.include}</p> : null}
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink">Reading time</legend>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[#637957]" checked={input.useNow} onChange={(e) => setInput((s) => ({ ...s, useNow: e.target.checked }))} />Use the current time</label>
              {!input.useNow ? (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-60"><Field label="Reading time (UTC)" hint="Date and time in UTC" error={errors.recordedAt}>{(id, d) => <Input id={id} aria-describedby={d} type="datetime-local" value={input.recordedAtInput} onChange={(e) => setInput((s) => ({ ...s, recordedAtInput: e.target.value }))} />}</Field></div>
                  {pond?.latestAt ? <Button size="sm" onClick={() => setInput((s) => ({ ...s, recordedAtInput: isoToUtcInput(new Date(Date.parse(pond.latestAt!) - 3 * 86400_000).toISOString()) }))}>Use a time inside this pond&apos;s history</Button> : null}
                </div>
              ) : null}
              {!input.useNow ? <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-ink-soft">A past time inside a pond&apos;s recorded history lets the model forecast from that point. A single reading never provides the 24 hours of earlier history the model needs by itself; at the current time most ponds have none, so no forecast is made. The simulated values are added to the real history around that time, and the forecast is labelled simulated.</p> : null}
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button variant="primary" type="submit" disabled={!db.canWrite}>Review and save simulated reading</Button>
              <p className="text-xs text-ink-soft">{db.canWrite ? 'You will be asked to confirm before anything is saved.' : 'Disabled: the API is not on a verified local database.'}</p>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="sim-prev" className="self-start">
            <CardHeader id="sim-prev" title="What will be submitted" description="Nothing is sent yet." />
            <dl className="space-y-3 px-5 pb-5 pt-4 text-[13px]">
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Pond</dt><dd className="text-right tabular-nums text-ink">{pond?.name ?? 'n/a'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Species</dt><dd className="text-right text-ink">{speciesLine(pond?.species)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Alert limits</dt><dd className="text-right text-ink">{pond?.species ? RULE_SCOPE_LABEL[pond.species.safetyProfile.ruleScope ?? 'general'] : 'General safety rules'}{pond?.species && !pond.species.safetyProfile.alertsEnabled ? <span className="block text-xs text-ink-soft">{SAFETY_LABEL[pond.species.safetyProfile.status].label}</span> : null}</dd></div>
              {PARAM_ORDER.map((p) => { const row = previewRows.find((r) => r.param === p); return (
                <div key={p} className="flex justify-between gap-4"><dt className="text-ink-soft">{SIM_LABEL[p]}</dt><dd className="text-right tabular-nums text-ink">{input[p].include ? (row ? row.text : <span className="text-ink-soft">Invalid, see form</span>) : <span className="text-ink-soft">Not included</span>}</dd></div>
              ); })}
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Reading time</dt><dd className="text-right tabular-nums text-ink">{input.useNow ? 'Now (set by the server)' : preview.ok && preview.body.recordedAt ? formatDateTime(preview.body.recordedAt) : 'Not set'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-ink-soft">Data source</dt><dd><SourceBadge source="simulated" /></dd></div>
              {rules && doNumber !== undefined && !pond?.species?.safetyProfile.alertsEnabled ? <p className="border-t border-line pt-3 text-xs text-ink-soft">Under the backend rules, {doNumber} {rules.dissolvedOxygen.unit} is {doNumber < rules.dissolvedOxygen.criticalBelow ? 'critical (below ' + fmtThreshold(rules.dissolvedOxygen.criticalBelow) + ')' : doNumber < rules.dissolvedOxygen.warningBelow ? 'a warning (below ' + fmtThreshold(rules.dissolvedOxygen.warningBelow) + ')' : 'not a warning (at or above ' + fmtThreshold(rules.dissolvedOxygen.warningBelow) + ')'}. The server makes the final classification.</p> : null}
              {pond?.species?.safetyProfile.alertsEnabled ? <p className="border-t border-line pt-3 text-xs text-ink-soft">This pond uses species-specific alert limits, so the general limits above may not apply. The server makes the classification and shows which limits it used.</p> : null}
              <p className="text-xs text-ink-soft"><Link href={`/ponds/${input.pondId}`} className="text-olive-text underline-offset-2 hover:underline">Change this pond&apos;s species</Link> to see how future simulated readings are evaluated.</p>
            </dl>
          </Card>

          <div aria-live="polite">
            {failure ? <Card><ErrorState error={failure} title="The simulation was not saved" onRetry={() => setFailure(null)} />{failure instanceof ApiError && failure.details?.length ? <ul className="px-6 pb-5 text-xs text-crit-text">{failure.details.map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}</ul> : null}</Card> : null}
            {result ? (
              <Card aria-labelledby="sim-res">
                <CardHeader id="sim-res" title="Result from the server" description={result.duplicate ? 'This reading was already saved.' : 'The simulated reading was saved.'} />
                <dl className="space-y-3 px-5 pb-5 pt-4 text-[13px]">
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Stored as</dt><dd className="flex items-center gap-2"><SourceBadge source={result.measurement.source} /></dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Reading time</dt><dd className="tabular-nums">{formatDateTime(result.measurement.recordedAt)}</dd></div>
                  {result.measurement.values.map((m) => {
                    const r = result.risk[m.parameter]; const known = r && (r.status === 'NORMAL' || r.status === 'WARNING' || r.status === 'CRITICAL');
                    return (
                      <div key={m.parameter} className="flex items-center justify-between gap-4"><dt className="text-ink-soft">{SIM_LABEL[m.parameter as SimParam] ?? m.parameter}</dt>
                        <dd className="flex items-center gap-2"><span className="tabular-nums">{formatValue(m.value, m.parameter)} {m.unit === 'C' ? '°C' : m.unit === 'pH' ? '' : m.unit}</span>
                          {r?.ruleScope ? <span className="text-xs text-ink-soft">{RULE_SCOPE_LABEL[r.ruleScope].toLowerCase()}</span> : null}
                          {known ? <StatusPill tone={RISK_TONE[r.status as 'NORMAL' | 'WARNING' | 'CRITICAL']}>{RISK_LABEL[r.status as 'NORMAL' | 'WARNING' | 'CRITICAL']}</StatusPill> : <StatusPill tone="muted">No alert rule</StatusPill>}</dd></div>
                    );
                  })}
                  {result.rejectedValues?.length ? <div role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn-text">Not saved (the server rejected these values): {result.rejectedValues.map((r) => `${r.parameter ?? 'unknown'}: ${r.reason}`).join('; ')}</div> : null}
                  <div className="flex justify-between gap-4"><dt className="text-ink-soft">Alerts</dt><dd className="text-right">{result.alerts.some((a) => a.action !== 'none') ? result.alerts.filter((a) => a.action !== 'none').map((a, i) => <span key={i} className="block"><span className="text-ink-soft">{SIM_LABEL[a.parameter as SimParam] ?? a.parameter}{a.direction && a.parameter !== 'dissolved_oxygen' ? ` (${a.direction})` : ''}: </span><span>{ACTION_TEXT[a.action] ?? a.action}</span></span>) : 'No alert change'}{!result.alertStateUpdated ? <span className="block text-xs text-ink-soft">Older than the newest reading, so alert state was not changed.</span> : null}</dd></div>
                  <div><dt className="text-ink-soft">Forecast</dt><dd className="mt-0.5">{INFERENCE_TEXT[result.inference.status] ?? result.inference.status}{result.inference.predictions ? ` (${result.inference.predictions} values)` : ''}</dd></div>
                  {result.inference.warnings?.length ? <div><dt className="text-ink-soft">Notes from the model</dt><dd className="mt-0.5 text-xs text-ink-soft">{result.inference.warnings.join(' ')}</dd></div> : null}
                </dl>
                <details className="border-t border-line px-5 py-3 text-xs">
                  <summary className="cursor-pointer text-ink-soft hover:text-ink">Request sent and raw server response</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink">{JSON.stringify({ request: sent, response: result }, null, 2)}</pre>
                </details>
                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
                  <Link href={`/ponds/${result.measurement.pondId}`} className={linkButtonClass('secondary', 'sm')}>See this pond (problems and forecast)</Link>
                  <Link href="/alerts" className={linkButtonClass('secondary', 'sm')}>See alerts</Link>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirm !== null && confirm.ok} title="Save this simulated reading?" confirmLabel="Save simulated reading" busy={busy} onConfirm={run} onCancel={() => !busy && setConfirm(null)}>
        <p>This permanently stores one reading for <strong className="font-medium text-ink">{pond?.name}</strong>, marked as simulated, on the connected local test database:</p>
        <ul className="list-disc space-y-0.5 pl-5">{previewRows.map((r) => <li key={r.param}><strong className="font-medium text-ink">{SIM_LABEL[r.param]}</strong>: {r.text}</li>)}</ul>
        <p>A dissolved-oxygen, pH or temperature value can open, update or resolve an alert and may create forecasts. It cannot be deleted from this interface.</p>
        {pond?.latestAt && !input.useNow ? <p className="text-xs">This pond&apos;s recorded history ends {formatAge(pond.latestAgeMinutes)}.</p> : null}
      </ConfirmDialog>
    </div>
  );
}
