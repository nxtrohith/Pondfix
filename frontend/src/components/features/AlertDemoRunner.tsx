'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert } from '@/lib/api/schemas';
import { useDbTarget } from '@/lib/useDbTarget';
import { formatDateTime } from '@/lib/format';
import { ALERT_STATUS_LABEL, ALERT_STATUS_TONE, RISK_LABEL, RISK_TONE, SEVERITY_TONE } from '@/lib/status';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select } from '../ui/Field';
import { Button, linkButtonClass } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Notice } from '../ui/states';
import { SourceBadge, StatusPill } from '../ui/StatusPill';
import { Table, Td, Th, Tr } from '../ui/Table';
import type { TrendPond } from './MeasurementTrend';

export const DEMO_STEPS = [
  { offsetSec: 0, doValue: 3.5, label: 'Normal reading', expectRisk: 'NORMAL' },
  { offsetSec: 5, doValue: 2.5, label: 'Warning opens an alert', expectRisk: 'WARNING' },
  { offsetSec: 10, doValue: 1.5, label: 'Escalates to critical', expectRisk: 'CRITICAL' },
  { offsetSec: 15, doValue: 3.5, label: 'Recovery resolves the alert', expectRisk: 'NORMAL' },
] as const;

type StepResult = { status: 'waiting' | 'sending' | 'done' | 'failed'; http?: number; risk?: string; action?: string; alertId?: string; forecast?: string; at?: string; error?: string };
type RunState = 'idle' | 'running' | 'paused' | 'finished' | 'stopped';
const ACTION_LABEL: Record<string, string> = { opened: 'Opened an alert', updated: 'Updated the open alert', escalated: 'Escalated the open alert', resolved: 'Resolved the open alert', none: 'No alert change' };
const blank = (): StepResult[] => DEMO_STEPS.map(() => ({ status: 'waiting' }));

export function AlertDemoRunner({ ponds, stepDelayMs = 5000 }: { ponds: TrendPond[]; stepDelayMs?: number }) {
  const api = useMemo(() => browserApi(), []);
  const db = useDbTarget();
  const [pondId, setPondId] = useState(ponds[0]?.id ?? '');
  const [steps, setSteps] = useState<StepResult[]>(blank);
  const [run, setRun] = useState<RunState>('idle');
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alerts, setAlerts] = useState<{ items: Alert[] } | { error: string } | null>(null);
  const token = useRef(0);              // bumping it cancels the loop in flight
  const busy = useRef(false);           // synchronous guard against double clicks and concurrent runs
  const ctrl = useRef<AbortController | null>(null);
  const pond = ponds.find((p) => p.id === pondId);
  const target = db.target;
  const canRun = db.canWrite;

  useEffect(() => () => { token.current++; ctrl.current?.abort(); }, []);

  const patch = (i: number, p: StepResult) => setSteps((s) => s.map((x, k) => (k === i ? p : x)));
  const wait = async (ms: number, my: number) => {
    for (let left = ms; left > 0 && token.current === my; left -= 250) { setCountdown(Math.ceil(left / 1000)); await new Promise((r) => setTimeout(r, Math.min(250, left))); }
    setCountdown(null);
  };
  async function refreshAlerts(my: number) {
    try { const r = await api.pondAlerts(pondId, { status: 'ALL', limit: 10 }); if (token.current === my) setAlerts({ items: r.items }); }
    catch (e) { if (token.current === my) setAlerts({ error: e instanceof ApiError ? e.message : 'Could not load alerts.' }); }
  }

  async function execute(from: number) {
    if (busy.current || !pondId) return;
    busy.current = true;
    const my = ++token.current;
    setRun('running'); setPausedAt(null);
    try {
      for (let i = from; i < DEMO_STEPS.length; i++) {
        if (i > from) await wait(stepDelayMs, my);
        if (token.current !== my) return;
        const step = DEMO_STEPS[i]!;
        patch(i, { status: 'sending' });
        ctrl.current = new AbortController();
        try {
          const r = await api.demoMeasurement({ pondId, dissolvedOxygen: step.doValue }, ctrl.current.signal);
          if (token.current !== my) return;
          const a = r.alerts[0];
          patch(i, { status: 'done', http: r.duplicate ? 200 : 201, risk: r.risk.dissolved_oxygen?.status, action: a?.action, alertId: a?.alertId, forecast: r.inference.status, at: r.measurement.recordedAt });
        } catch (e) {
          if (token.current !== my) return;
          patch(i, { status: 'failed', http: e instanceof ApiError ? e.status : undefined, error: e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : 'The request failed.' });
          setPausedAt(i); setRun('paused');
          return; // pause: never skip a failed step
        }
        await refreshAlerts(my);
      }
      if (token.current === my) setRun('finished');
    } finally { busy.current = false; }
  }

  function start() { setConfirmOpen(false); setSteps(blank()); setAlerts(null); void execute(0); }
  function stop() { token.current++; ctrl.current?.abort(); busy.current = false; setCountdown(null); setRun('stopped'); setSteps((s) => s.map((x) => (x.status === 'sending' ? { status: 'waiting' } : x))); }
  const retry = () => { if (pausedAt !== null) void execute(pausedAt); };
  const running = run === 'running';

  return (
    <Card aria-labelledby="demo-title">
      <CardHeader id="demo-title" title="Guided alert demo" description="Sends four simulated dissolved-oxygen readings, 5 seconds apart, so you can watch an alert open, escalate and resolve." />
      <div className="space-y-4 px-5 pb-5 pt-4">
        {db.loading ? <p className="text-sm text-ink-soft">Checking which database the API uses.</p>
          : db.error ? <Notice tone="warning">Could not check the API&apos;s database. The demo is disabled until the API responds. <button type="button" onClick={db.reload} className="underline">Retry</button></Notice>
          : db.canWrite ? <Notice tone="warning">Demo mode is on. The demo readings are <strong className="font-medium">saved to the Atlas database</strong>, marked as simulated.</Notice>
          : <Notice tone="warning"><strong className="font-medium">The demo is disabled.</strong> {target === 'atlas' ? 'Demo mode is off on the API (DEMO_ENABLED=false), so simulated readings are not accepted.' : 'This API did not report an Atlas database.'}</Notice>}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64"><Field label="Pond">{(id) => <Select id={id} value={pondId} disabled={running || run === 'paused'} onChange={(e) => { setPondId(e.target.value); setSteps(blank()); setAlerts(null); setRun('idle'); }}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field></div>
          {run === 'idle' || run === 'finished' || run === 'stopped' ? <Button variant="primary" disabled={!canRun || !pondId} onClick={() => setConfirmOpen(true)}>{run === 'idle' ? 'Start demo' : 'Run again'}</Button> : null}
          {run === 'paused' ? <Button variant="primary" onClick={retry}>Retry step {(pausedAt ?? 0) + 1}</Button> : null}
          {running || run === 'paused' ? <Button onClick={stop}>Stop demo</Button> : null}
        </div>

        <div aria-live="polite" className="min-h-5 text-sm text-ink-soft">
          {running ? (countdown !== null ? `Next reading in ${countdown} s.` : 'Sending a reading.') : run === 'paused' ? 'Paused after a failed step. Nothing was skipped; retry the step or stop.' : run === 'finished' ? 'Sequence complete. Every row below is the server\'s actual response.' : run === 'stopped' ? 'Stopped. Readings already sent remain saved as simulated data.' : ''}
        </div>

        <Table caption="Guided demo steps and server responses" className="min-w-[760px]">
          <thead><tr><Th>Step</Th><Th>Dissolved oxygen</Th><Th>Expected</Th><Th>Request</Th><Th>Server classification</Th><Th>Alert result</Th></tr></thead>
          <tbody>
            {DEMO_STEPS.map((s, i) => {
              const r = steps[i]!;
              const risk = r.risk && (r.risk === 'NORMAL' || r.risk === 'WARNING' || r.risk === 'CRITICAL') ? r.risk : undefined;
              return (
                <Tr key={i}>
                  <Td className="whitespace-nowrap"><span className="font-medium">{i + 1}</span> <span className="text-xs text-ink-soft">T+{s.offsetSec}s</span></Td>
                  <Td className="tabular-nums">{s.doValue.toFixed(1)} <span className="text-xs text-ink-soft">mg/L</span></Td>
                  <Td className="text-ink-soft">{s.label}</Td>
                  <Td>
                    {r.status === 'waiting' ? <StatusPill tone="muted">Waiting</StatusPill> : r.status === 'sending' ? <StatusPill tone="neutral">Sending</StatusPill>
                      : r.status === 'done' ? <span className="flex items-center gap-2"><StatusPill tone="healthy">Done</StatusPill><span className="text-xs tabular-nums text-ink-soft">HTTP {r.http}</span></span>
                      : <div><StatusPill tone="critical">Failed</StatusPill>{r.http ? <span className="ml-2 text-xs tabular-nums text-ink-soft">HTTP {r.http}</span> : null}<p role="alert" className="mt-1 max-w-[28ch] text-xs text-crit-text">{r.error}</p></div>}
                  </Td>
                  <Td>{risk ? <div className="flex items-center gap-2"><StatusPill tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</StatusPill>{risk !== s.expectRisk ? <span className="text-xs text-warn-text">expected {RISK_LABEL[s.expectRisk]}</span> : null}</div> : <span className="text-ink-soft">n/a</span>}</Td>
                  <Td>{r.status === 'done' ? <div><p>{ACTION_LABEL[r.action ?? 'none'] ?? r.action}</p>{r.alertId ? <p className="mt-0.5 font-mono text-xs text-ink-soft">{r.alertId}</p> : null}</div> : <span className="text-ink-soft">n/a</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">Alerts for {pond?.name ?? 'this pond'} (live from the API)</h3>
            <Link href={`/alerts?pond=${pondId}`} target="_blank" className={linkButtonClass('secondary', 'sm')}>Open Alerts in a new tab</Link>
          </div>
          {alerts === null ? <p className="mt-2 text-xs text-ink-soft">Shown after the first reading is sent.</p>
            : 'error' in alerts ? <p className="mt-2 text-xs text-crit-text" role="alert">Could not load alerts: {alerts.error}</p>
            : alerts.items.length === 0 ? <p className="mt-2 text-xs text-ink-soft">No alerts exist for this pond. The server created none.</p>
            : (
              <ul className="mt-2 divide-y divide-line/70 rounded-lg border border-line">
                {alerts.items.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
                    <StatusPill tone={SEVERITY_TONE[a.severity]}>{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</StatusPill>
                    <StatusPill tone={ALERT_STATUS_TONE[a.status]}>{ALERT_STATUS_LABEL[a.status]}</StatusPill>
                    {a.dataSource ? <SourceBadge source={a.dataSource} /> : null}
                    <span className="tabular-nums text-ink-soft">trigger {a.triggerValue.toFixed(2)} mg/L</span>
                    <span className="font-mono text-xs text-ink-soft">{a.id}</span>
                    <span className="ml-auto text-xs tabular-nums text-ink-soft">{a.resolvedAt ? `resolved ${formatDateTime(a.resolvedAt)}` : `updated ${formatDateTime(a.lastTriggeredAt)}`}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      <ConfirmDialog open={confirmOpen} title="Run the guided alert demo?" confirmLabel="Run demo" onConfirm={start} onCancel={() => setConfirmOpen(false)}>
        <p>This saves <strong className="font-medium text-ink">four simulated readings</strong> (3.5, 2.5, 1.5 and 3.5 mg/L) for <strong className="font-medium text-ink">{pond?.name}</strong> on the connected local test database, 5 seconds apart. It will open, escalate and resolve an alert.</p>
        <p>Readings are marked simulated and can&apos;t be deleted from this screen. Stopping part-way leaves the readings already sent in place.</p>
      </ConfirmDialog>
    </Card>
  );
}
