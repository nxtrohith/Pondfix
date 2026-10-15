'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { browserApi, ApiError } from '@/lib/api/client';
import type { ReplayForecast, ReplayForecastItem, RiskRules } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { DEFAULT_SPEED, FORECAST_EVERY_MS, SPEEDS, deriveAlerts, idlePlayback, observedSeries, playbackReducer, replayRunId, shouldForecast, validateRange, visibleCount, type AlertEvent, type ReplayStatus } from '@/lib/replay';
import { gapThreshold } from '@/lib/chart';
import { isoToUtcInput, utcInputToIso } from '@/lib/simulation';
import { PARAM_LABEL, fmtThreshold, formatDateTime, formatValue, horizonLabel, unitLabel } from '@/lib/format';
import { alertTitle } from '@/lib/alerts';
import { RISK_LABEL, RISK_TONE } from '@/lib/status';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { StatusPill } from '../ui/StatusPill';
import { Skeleton } from '../ui/Skeleton';
import { SERIES_COLOR, TrendChart, type Series, type Threshold } from '../charts/TrendChart';

const STATUS_LABEL: Record<ReplayStatus, string> = { idle: 'Not loaded', ready: 'Ready', playing: 'Playing', paused: 'Paused', stopped: 'Stopped', finished: 'Finished' };
const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
const FC_TEXT: Record<string, string> = {
  insufficient_history: 'No forecast at this point: the model needs at least 24 hours of earlier readings for this pond.',
  unavailable: 'No forecast: the forecasting service was unavailable.',
  disabled: 'Forecasting is disabled on this server.',
  skipped: 'Forecasting was skipped for this reading.',
};
const ACTION_LABEL: Record<AlertEvent['action'], string> = { opened: 'Opened', escalated: 'Escalated', downgraded: 'Severity lowered', resolved: 'Resolved' };

type FcEntry = { data: ReplayForecast } | { error: string; retryable: boolean };
const errMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'The forecast request failed.');

export function HistoricalReplay({ rules }: { rules: RiskRules | null }) {
  const api = useMemo(() => browserApi(), []);
  const ponds = useApiQuery((s) => api.replayPonds(s), []);
  const [pondChoice, setPondChoice] = useState('');
  const pondId = pondChoice || ponds.data?.items[0]?.id || '';
  const coverage = useApiQuery((s) => api.replayCoverage(pondId, s), [pondId], !!pondId);
  const [applied, setApplied] = useState<{ pondId: string; from: string; to: string } | null>(null);
  const [edit, setEdit] = useState<{ from?: string; to?: string }>({});
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Default: the pond's 24-hour preset (once its coverage is known), so a demonstration can start immediately.
  const preset24 = coverage.data && coverage.data.pond.id === pondId ? coverage.data.presets['24h'] : undefined;
  const defaultRange = preset24?.valid && preset24.from && preset24.to ? { pondId, from: preset24.from, to: preset24.to } : null;
  const activeRange = applied && applied.pondId === pondId ? applied : defaultRange;
  const customFrom = edit.from ?? (activeRange ? isoToUtcInput(activeRange.from) : '');
  const customTo = edit.to ?? (activeRange ? isoToUtcInput(activeRange.to) : '');
  const win = useApiQuery((s) => api.replayWindow(pondId, { from: activeRange!.from, to: activeRange!.to }, s), [pondId, activeRange?.from, activeRange?.to], !!activeRange);
  const windowData = win.data;

  const [pb, dispatch] = useReducer(playbackReducer, undefined, () => idlePlayback(DEFAULT_SPEED));
  const [forecasts, setForecasts] = useState<Record<string, FcEntry>>({});
  const [runNo, setRunNo] = useState(0);
  const inflight = useRef<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const [fcTick, setFcTick] = useState(0);

  const items = useMemo(() => windowData?.items ?? [], [windowData]);
  const times = useMemo(() => items.map((i) => Date.parse(i.recordedAt)), [items]);
  const gapMs = useMemo(() => Math.max((coverage.data?.gapThresholdMinutes ?? 20) * 60_000, gapThreshold(times)), [coverage.data, times]);

  // A new/changed window discards everything derived from the previous run (state adjusted during render, in-flight work aborted in cleanup).
  const [seenWindow, setSeenWindow] = useState<typeof windowData | undefined>(undefined);
  if (windowData !== seenWindow) {
    setSeenWindow(windowData);
    setForecasts({});
    if (windowData && windowData.items.length) { dispatch({ type: 'load', from: Date.parse(windowData.from), to: Date.parse(windowData.to) }); setRunNo((n) => n + 1); }
    else dispatch({ type: 'unload' });
  }
  useEffect(() => () => { ctrl.current?.abort(); ctrl.current = null; inflight.current = null; }, [windowData]);

  // Playback clock: wall-clock deltas x speed, so the position follows the original timestamps rather than a fixed step per tick.
  useEffect(() => {
    if (pb.status !== 'playing') return;
    let last = performance.now();
    const id = setInterval(() => { const n = performance.now(); dispatch({ type: 'tick', realMs: n - last }); last = n; }, 200);
    return () => clearInterval(id);
  }, [pb.status]);

  const count = visibleCount(times, pb.position);
  const current = count ? items[count - 1]! : null;
  const currentT = count ? times[count - 1]! : null;

  // Forecasts happen at measurement boundaries, at most one request in flight, and never faster than FORECAST_EVERY_MS of replayed time.
  const priorT = currentT === null ? null : Object.keys(forecasts).map(Date.parse).filter((t) => t <= currentT).sort((a, b) => b - a)[0] ?? null;
  const started = pb.status !== 'idle' && pb.status !== 'ready';
  const needForecast = !!windowData && !!current && started && !forecasts[current.recordedAt] && (pb.status !== 'playing' || shouldForecast(priorT, currentT!, FORECAST_EVERY_MS));
  const currentKey = current?.recordedAt ?? null;
  useEffect(() => {
    if (!needForecast || !currentKey || inflight.current) return;
    const key = currentKey;
    const c = new AbortController(); ctrl.current = c; inflight.current = key;
    api.replayForecast({ pondId, at: key }, c.signal).then(
      (data) => { if (!c.signal.aborted) setForecasts((f) => ({ ...f, [key]: { data } })); },
      (e) => { if (!c.signal.aborted && !(e instanceof ApiError && e.kind === 'aborted')) setForecasts((f) => ({ ...f, [key]: { error: errMessage(e), retryable: e instanceof ApiError ? e.retryable : true } })); },
    ).finally(() => { if (inflight.current === key) { inflight.current = null; if (!c.signal.aborted) setFcTick((t) => t + 1); } });
  }, [api, pondId, needForecast, currentKey, fcTick]);

  const retryForecast = (key: string) => setForecasts((f) => { const { [key]: _drop, ...rest } = f; return rest; });
  const reset = () => { ctrl.current?.abort(); ctrl.current = null; inflight.current = null; setForecasts({}); dispatch({ type: 'reset' }); setRunNo((n) => n + 1); };

  // ---- derived views (all from backend data) ----
  const fcList = useMemo(() => Object.entries(forecasts).map(([k, v]) => ({ t: Date.parse(k), key: k, v })).filter((e) => currentT !== null && e.t <= currentT).sort((a, b) => a.t - b.t), [forecasts, currentT]);
  const latestFc = [...fcList].reverse().find((e) => 'data' in e.v) as { t: number; key: string; v: { data: ReplayForecast } } | undefined;
  const latestFcEntry = fcList.at(-1);
  const alerts = useMemo(() => {
    // Same lifecycle per parameter and side (low/high) as the backend; a record without the parameter changes nothing.
    const observed = PARAMS.flatMap((p) => (['low', 'high'] as const).flatMap((side) => deriveAlerts(items.slice(0, count).map((i) => {
      const r = i.risk[p]; const v = i.values.find((x) => x.parameter === p)?.value ?? NaN;
      const status = !r || r.status === 'UNKNOWN' ? 'UNKNOWN' : r.status === 'NORMAL' || (r.direction ?? 'low') !== side ? 'NORMAL' : r.status;
      return { t: Date.parse(i.recordedAt), status: status as 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN', value: v };
    }), 'observed', { parameter: p, direction: side })));
    const predicted = deriveAlerts(fcList.flatMap((e) => ('data' in e.v && e.v.data.predictedRisk ? [{ t: e.t, status: e.v.data.predictedRisk.status, value: e.v.data.predictedRisk.value, detail: `${horizonLabel(e.v.data.predictedRisk.horizonMinutes)} ahead` }] : [])), 'predicted', { parameter: 'dissolved_oxygen', direction: 'low' });
    return [...observed, ...predicted].sort((a, b) => a.t - b.t);
  }, [items, count, fcList]);

  // Limit lines come from the backend's active rules; nothing is hardcoded here.
  const thresholdsFor = (p: string): Threshold[] => {
    const r = rules?.parameters?.[p];
    if (r) {
      const sfx = unitLabel(r.unit) ? ` ${unitLabel(r.unit)}` : '';
      return [
        ...(r.lowWarning !== undefined ? [{ y: r.lowWarning, label: `Warning below ${r.lowWarning}${sfx}`, tone: 'warn' as const }] : []), ...(r.highWarning !== undefined ? [{ y: r.highWarning, label: `Warning above ${r.highWarning}${sfx}`, tone: 'warn' as const }] : []),
        ...(r.lowCritical !== undefined ? [{ y: r.lowCritical, label: `Critical below ${r.lowCritical}${sfx}`, tone: 'crit' as const }] : []), ...(r.highCritical !== undefined ? [{ y: r.highCritical, label: `Critical above ${r.highCritical}${sfx}`, tone: 'crit' as const }] : []),
      ];
    }
    return p === 'dissolved_oxygen' && rules ? [{ y: rules.dissolvedOxygen.warningBelow, label: `Warning below ${fmtThreshold(rules.dissolvedOxygen.warningBelow)} mg/L`, tone: 'warn' }, { y: rules.dissolvedOxygen.criticalBelow, label: `Critical below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)} mg/L`, tone: 'crit' }] : [];
  };
  const chartSeries = (param: string) => {
    const obs = observedSeries(items, param, count, gapMs);
    const out: Series[] = [{ key: 'obs', label: 'Observed (historical record)', points: obs.points, color: SERIES_COLOR.observed }];
    const h60 = fcList.flatMap((e) => ('data' in e.v ? e.v.data.forecasts.filter((f) => f.parameter === param && f.horizonMinutes === 60 && f.status === 'ok' && f.forecastFor) .map((f) => ({ t: Date.parse(f.forecastFor!), v: f.value! })) : [])).sort((a, b) => a.t - b.t);
    if (h60.length) out.push({ key: 'f60', label: 'Model forecast, 60 min ahead (plotted at its target time)', points: h60, color: SERIES_COLOR.forecast, dashed: true });
    const pts = latestFc ? latestFc.v.data.forecasts.filter((f) => f.parameter === param && f.status === 'ok' && f.forecastFor).map((f) => ({ t: Date.parse(f.forecastFor!), v: f.value! })) : [];
    if (pts.length) out.push({ key: 'fnow', label: `Latest forecast (15, 60, 180 min ahead, made at ${formatDateTime(latestFc!.key)})`, points: pts, color: SERIES_COLOR.forecast, dotsOnly: true });
    return { series: out, unit: obs.unit };
  };

  // ---- range controls ----
  const first = coverage.data?.first ?? null; const last = coverage.data?.last ?? null;
  const applyPreset = (k: '24h' | '7d') => {
    const p = coverage.data?.presets[k]; if (!p?.valid || !p.from || !p.to) return;
    setRangeError(null); setEdit({}); setApplied({ pondId, from: p.from, to: p.to });
  };
  const applyCustom = () => {
    const v = validateRange(utcInputToIso(customFrom), utcInputToIso(customTo), { first, last });
    if (!v.ok) { setRangeError(v.error); return; }
    setRangeError(null); setEdit({}); setApplied({ pondId, from: v.from, to: v.to });
  };
  const changePond = (id: string) => { setPondChoice(id); setApplied(null); setRangeError(null); setEdit({}); };

  const pond = coverage.data?.pond ?? ponds.data?.items.find((p) => p.id === pondId);
  const runId = windowData && pond ? replayRunId(pond.sourceId ?? pond.name, windowData.from, windowData.to, runNo) : null;
  const duration = Math.max(pb.to - pb.from, 1);
  const pct = Math.round(((pb.position - pb.from) / duration) * 100);
  const loaded = pb.status !== 'idle';
  const busy = win.loading && !!activeRange;

  if (ponds.loading && !ponds.data) return <Card className="p-5"><Skeleton className="h-6 w-56" /><Skeleton className="mt-4 h-40 w-full" /></Card>;
  if (ponds.error) return <Card><ErrorState error={ponds.error} title="Could not load historical ponds" onRetry={ponds.reload} /></Card>;
  if (!ponds.data?.items.length) return <Card><EmptyState title="No historical data to replay">This database holds no imported historical pond readings.</EmptyState></Card>;

  return (
    <div className="space-y-6">
      <Notice tone="warning"><strong className="font-medium">Historical replay: recorded data, not live sensor readings.</strong> Original readings and timestamps are replayed in order. Nothing is saved: replaying creates no records or alerts and cannot change live alerts. Forecasts come from the real PondFix model using only readings up to the replayed moment.</Notice>

      <Card aria-labelledby="rp-setup">
        <CardHeader id="rp-setup" title="Choose a pond and period" description="Ponds and periods come from the imported historical dataset." />
        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
            <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => changePond(e.target.value)}>{ponds.data!.items.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.records.toLocaleString('en-GB')} records)</option>)}</Select>}</Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Preset window</p>
              <div className="flex flex-wrap items-center gap-2">
                {(['24h', '7d'] as const).map((k) => { const p = coverage.data?.presets[k]; return (
                  <Button key={k} size="sm" disabled={!p?.valid} onClick={() => applyPreset(k)} title={p?.valid ? `${p.records} of ${p.expected} expected records (${Math.round((p.coverage ?? 0) * 100)}%), ${p.gaps} gap(s)` : 'No continuous window of this length exists for this pond'}>{k === '24h' ? '24 hours' : '7 days'}</Button>
                ); })}
                {coverage.loading ? <span className="text-xs text-ink-soft">Checking coverage…</span> : null}
                {coverage.error ? <span role="alert" className="text-xs text-crit-text">Could not check coverage.</span> : null}
              </div>
              {coverage.data ? <p className="mt-1.5 text-xs text-ink-soft">Recorded {formatDateTime(coverage.data.first)} to {formatDateTime(coverage.data.last)}. A preset is offered only when at least {Math.round((coverage.data.presets['24h']?.minCoverage ?? 0.8) * 100)}% of the expected {coverage.data.expectedIntervalMinutes}-minute readings exist.</p> : null}
            </div>
          </div>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); applyCustom(); }} noValidate>
            <div className="w-56"><Field label="Start (UTC)" error={rangeError ?? undefined}>{(id, d) => <Input id={id} aria-describedby={d} type="datetime-local" value={customFrom} onChange={(e) => setEdit((c) => ({ ...c, from: e.target.value }))} />}</Field></div>
            <div className="w-56"><Field label="End (UTC)">{(id) => <Input id={id} type="datetime-local" value={customTo} onChange={(e) => setEdit((c) => ({ ...c, to: e.target.value }))} />}</Field></div>
            <Button type="submit" size="md" disabled={busy}>Load custom range</Button>
          </form>
        </div>
      </Card>

      {busy && !windowData ? <Card className="p-5"><Skeleton className="h-6 w-56" /><Skeleton className="mt-4 h-40 w-full" /></Card> : null}
      {win.error ? <Card><ErrorState error={win.error} title="Could not load this period" onRetry={win.reload} /></Card> : null}
      {windowData && !windowData.items.length ? <Card><EmptyState title="No readings in this period">Pick another period; replay never fills in missing readings.</EmptyState></Card> : null}

      {loaded && windowData ? (
        <>
          <Card aria-labelledby="rp-run">
            <CardHeader id="rp-run" title="Replay" description={<><StatusPill tone="neutral">HISTORICAL REPLAY</StatusPill> <span className="ml-1">Recorded {windowData.dataset ?? 'dataset'} data, never live.</span></>} />
            <div className="space-y-4 px-5 pb-5 pt-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3 xl:grid-cols-6">
                <div><dt className="text-ink-soft">Pond</dt><dd className="font-medium text-ink">{windowData.pond.name}</dd></div>
                <div><dt className="text-ink-soft">Source period</dt><dd className="tabular-nums text-ink">{formatDateTime(windowData.from)} to {formatDateTime(windowData.to)}</dd></div>
                <div><dt className="text-ink-soft">Records loaded</dt><dd className="tabular-nums text-ink">{windowData.records}{windowData.duplicatesSkipped ? ` (${windowData.duplicatesSkipped} duplicate timestamp skipped)` : ''}</dd></div>
                <div><dt className="text-ink-soft">Replay time</dt><dd className="tabular-nums text-ink" data-testid="replay-time">{current ? formatDateTime(current.recordedAt) : `Before the first reading (${formatDateTime(new Date(pb.position).toISOString())})`}</dd></div>
                <div><dt className="text-ink-soft">Status</dt><dd className="font-medium text-ink" data-testid="replay-status">{STATUS_LABEL[pb.status]}</dd></div>
                <div><dt className="text-ink-soft">Run ID</dt><dd className="font-mono text-xs text-ink">{runId}</dd></div>
              </dl>

              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface" role="progressbar" aria-label="Replay progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-soft"><span>{formatDateTime(windowData.from)}</span><span>{pct}% · {count} of {windowData.records} records</span><span>{formatDateTime(windowData.to)}</span></div>
                <input type="range" className="mt-2 w-full accent-brand" aria-label="Replay position" min={0} max={Math.round(duration / 60_000)} step={1} value={Math.round((pb.position - pb.from) / 60_000)} onChange={(e) => dispatch({ type: 'seek', position: pb.from + Number(e.target.value) * 60_000 })} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Button variant="primary" onClick={() => dispatch({ type: 'play' })} disabled={pb.status === 'playing'}>{pb.status === 'paused' ? 'Resume' : pb.status === 'finished' || pb.status === 'stopped' ? 'Restart' : 'Start'}</Button>
                <Button onClick={() => dispatch({ type: 'pause' })} disabled={pb.status !== 'playing'}>Pause</Button>
                <Button onClick={() => dispatch({ type: 'stop' })} disabled={pb.status !== 'playing' && pb.status !== 'paused'}>Stop</Button>
                <Button onClick={reset}>Reset</Button>
                <div className="w-48"><Field label="Speed">{(id) => <Select id={id} value={pb.speed} onChange={(e) => dispatch({ type: 'speed', speed: Number(e.target.value) })}>{SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>}</Field></div>
              </div>
              <p className="text-xs leading-relaxed text-ink-soft">Stop halts the replay and keeps what has been shown; Start then replays from the beginning. Reset returns to the start and clears forecasts and the alert timeline. Pause and Resume keep the exact position.</p>
              {windowData.gaps.length ? <p className="text-xs text-ink-soft" data-testid="gap-note">{windowData.gaps.length} gap{windowData.gaps.length === 1 ? '' : 's'} longer than the normal {windowData.expectedIntervalMinutes}-minute spacing (longest {Math.max(...windowData.gaps.map((g) => g.minutes))} min). Chart lines break at gaps; nothing is filled in.</p> : null}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              {PARAMS.map((p) => { const { series, unit } = chartSeries(p); return (
                <Card key={p} aria-labelledby={`rp-${p}`}>
                  <CardHeader id={`rp-${p}`} title={`${PARAM_LABEL[p]}${unitLabel(unit) ? ` (${unitLabel(unit)})` : ''}`} description="Observed record versus model forecasts. Dashed line: forecasts made 60 minutes earlier, drawn at the time they predicted." />
                  <div className="px-3 pb-4 pt-3"><TrendChart series={series} parameter={p} unit={unit} thresholds={thresholdsFor(p)} domain={[pb.from, pb.to]} cursorAt={pb.position} summaryLabel={`${PARAM_LABEL[p]} during historical replay`} height={220} /></div>
                </Card>
              ); })}
            </div>

            <div className="space-y-6 self-start">
              <Card aria-labelledby="rp-now">
                <CardHeader id="rp-now" title="Current replayed reading" description={current ? formatDateTime(current.recordedAt) : 'Press Start'} />
                <dl className="space-y-3 px-5 pb-5 pt-4 text-sm">
                  {current ? PARAMS.map((p) => { const v = current.values.find((x) => x.parameter === p); const r = current.risk[p]?.status; return (
                    <div key={p} className="flex items-center justify-between gap-4"><dt className="text-ink-soft">{PARAM_LABEL[p]}</dt>
                      <dd className="flex items-center gap-2"><span className="tabular-nums">{v ? formatValue(v.value, p, true, v.unit) : 'no reading'}</span>
{r && r !== 'UNKNOWN' ? <StatusPill tone={RISK_TONE[r]}>{RISK_LABEL[r]}</StatusPill> : v ? <StatusPill tone="muted">No alert rule</StatusPill> : null}</dd></div>
                  ); }) : <p className="text-ink-soft">No reading has been reached yet.</p>}
                </dl>
              </Card>

              <Card aria-labelledby="rp-fc" aria-live="polite">
                <CardHeader id="rp-fc" title="Model forecast" description={latestFc ? `Made from readings up to ${formatDateTime(latestFc.key)}` : 'Real PondFix model, run at measurement boundaries'} />
                <div className="space-y-3 px-5 pb-5 pt-4 text-sm">
                  {latestFc ? <ForecastTable data={latestFc.v.data} /> : null}
                  {latestFcEntry && 'data' in latestFcEntry.v && latestFcEntry.v.data.status !== 'ok' ? <p className="text-ink-soft">{FC_TEXT[latestFcEntry.v.data.status] ?? latestFcEntry.v.data.status}{latestFcEntry.v.data.message ? ` (${latestFcEntry.v.data.message})` : ''}</p> : null}
                  {latestFcEntry && 'error' in latestFcEntry.v ? <div role="alert" className="text-crit-text">{latestFcEntry.v.error}{latestFcEntry.v.retryable ? <> <button className="underline" onClick={() => retryForecast(latestFcEntry.key)}>Retry</button></> : null}</div> : null}
                  {needForecast ? <p className="text-xs text-ink-soft">Running the model…</p> : null}
                  {!fcList.length && !needForecast ? <p className="text-ink-soft">No forecast yet. Start the replay or move the position.</p> : null}
                  <p className="text-xs leading-relaxed text-ink-soft">Forecasts are model output, not measurements. They are not stored.</p>
                </div>
              </Card>

              <Card aria-labelledby="rp-alerts">
                <CardHeader id="rp-alerts" title="Replay alert timeline" description="Same rules as live readings. Not stored, separate from live alerts." />
                <div className="px-5 pb-5 pt-4 text-sm">
                  {alerts.length ? (
                    <ol className="space-y-2.5" data-testid="alert-timeline">
                      {alerts.map((a, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <div><p className="text-ink"><span className="font-medium">{a.parameter ? alertTitle({ parameter: a.parameter, direction: a.parameter === 'dissolved_oxygen' ? undefined : a.direction }) : ''}</span> {ACTION_LABEL[a.action]}{a.severity ? ` · ${a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}` : ''} <span className="text-ink-soft">{a.origin === 'observed' ? '(observed reading)' : `(model forecast${a.detail ? `, ${a.detail}` : ''}, not observed)`}</span></p>
                            <p className="text-xs tabular-nums text-ink-soft">{formatDateTime(new Date(a.t).toISOString())} · {formatValue(a.value, 'dissolved_oxygen', true, 'mg/L')}</p></div>
                          <StatusPill tone={a.origin === 'observed' ? 'neutral' : 'muted'}>{a.origin === 'observed' ? 'Observed' : 'Forecast'}</StatusPill>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-ink-soft">No alert conditions reached so far.</p>}
                  <p className="mt-3 text-xs leading-relaxed text-ink-soft">Forecast alerts exist for dissolved oxygen only and are evaluated when a forecast is made (about once per replayed hour). The source dataset contains no historical alerts.</p>
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ForecastTable({ data }: { data: ReplayForecast }) {
  const horizons = [...new Set(data.forecasts.map((f) => f.horizonMinutes))].sort((a, b) => a - b);
  const cell = (p: string, h: number): ReplayForecastItem | undefined => data.forecasts.find((f) => f.parameter === p && f.horizonMinutes === h);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="text-ink-soft"><th className="py-1 pr-3 font-normal">Parameter</th>{horizons.map((h) => <th key={h} className="py-1 pr-3 font-normal">+{horizonLabel(h)}</th>)}</tr></thead>
        <tbody>
          {PARAMS.map((p) => (
            <tr key={p} className="border-t border-line">
              <th scope="row" className="py-1.5 pr-3 font-normal text-ink-soft">{PARAM_LABEL[p]}</th>
              {horizons.map((h) => { const f = cell(p, h); return (
                <td key={h} className="py-1.5 pr-3 tabular-nums">
                  {f?.status === 'ok' ? <><span className="text-ink">{formatValue(f.value, p)}</span>{f.risk && f.risk !== 'UNKNOWN' ? <span className="ml-1.5"><StatusPill tone={RISK_TONE[f.risk]}>{RISK_LABEL[f.risk]}</StatusPill></span> : null}</> : <span className="text-ink-soft" title={f?.reason}>{f ? 'withheld' : 'n/a'}</span>}
                </td>
              ); })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.forecasts.some((f) => f.status === 'withheld') ? <p className="mt-2 text-xs text-ink-soft">Withheld: {[...new Set(data.forecasts.filter((f) => f.status === 'withheld').map((f) => f.reason).filter(Boolean))].join('; ')}</p> : null}
      {data.warnings?.length ? <p className="mt-1 text-xs text-ink-soft">Model notes: {data.warnings.join(' ')}</p> : null}
    </div>
  );
}
