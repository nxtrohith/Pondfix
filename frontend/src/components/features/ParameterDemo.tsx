'use client';
import { useMemo, useState } from 'react';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert, IngestResponse } from '@/lib/api/schemas';
import { useDbTarget } from '@/lib/useDbTarget';
import { PARAM_LABEL, formatValue } from '@/lib/format';
import { RISK_LABEL, RISK_TONE } from '@/lib/status';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Notice } from '../ui/states';
import { StatusPill } from '../ui/StatusPill';
import { Table, Td, Th, Tr } from '../ui/Table';
import { AlertCardList } from './AlertCard';
import type { TrendPond } from './MeasurementTrend';

type Param = 'dissolved_oxygen' | 'ph' | 'temperature';
type Risk = 'NORMAL' | 'WARNING' | 'CRITICAL';
interface Step { label: string; values: Partial<Record<Param, number>>; expect: Partial<Record<Param, Risk>> }

/**
 * A fixed, repeatable sequence of simulated readings. The values are inputs only: every classification and alert result shown is
 * the backend's response, and a row is flagged if the server's classification differs from the one this script expects (for example
 * if the active rules were changed).
 */
export const PARAMETER_DEMO_STEPS: Step[] = [
  { label: 'Normal reading', values: { dissolved_oxygen: 5.2, ph: 7.4, temperature: 27 }, expect: { dissolved_oxygen: 'NORMAL', ph: 'NORMAL', temperature: 'NORMAL' } },
  { label: 'Low pH warning', values: { ph: 6.2 }, expect: { ph: 'WARNING' } },
  { label: 'Low pH critical', values: { ph: 5.5 }, expect: { ph: 'CRITICAL' } },
  { label: 'pH recovers', values: { ph: 7.4 }, expect: { ph: 'NORMAL' } },
  { label: 'High pH warning', values: { ph: 8.8 }, expect: { ph: 'WARNING' } },
  { label: 'High pH critical', values: { ph: 9.4 }, expect: { ph: 'CRITICAL' } },
  { label: 'pH recovers', values: { ph: 7.4 }, expect: { ph: 'NORMAL' } },
  { label: 'Low temperature warning', values: { temperature: 18 }, expect: { temperature: 'WARNING' } },
  { label: 'Low temperature critical', values: { temperature: 12 }, expect: { temperature: 'CRITICAL' } },
  { label: 'Temperature recovers', values: { temperature: 27 }, expect: { temperature: 'NORMAL' } },
  { label: 'High temperature warning', values: { temperature: 34 }, expect: { temperature: 'WARNING' } },
  { label: 'High temperature critical', values: { temperature: 37 }, expect: { temperature: 'CRITICAL' } },
  { label: 'Temperature recovers', values: { temperature: 27 }, expect: { temperature: 'NORMAL' } },
  { label: 'Dissolved-oxygen warning', values: { dissolved_oxygen: 2.5 }, expect: { dissolved_oxygen: 'WARNING' } },
  { label: 'Dissolved-oxygen critical', values: { dissolved_oxygen: 1.5 }, expect: { dissolved_oxygen: 'CRITICAL' } },
  { label: 'Dissolved oxygen recovers', values: { dissolved_oxygen: 5.2 }, expect: { dissolved_oxygen: 'NORMAL' } },
  { label: 'Three alerts from one reading', values: { dissolved_oxygen: 2.5, ph: 8.8, temperature: 34 }, expect: { dissolved_oxygen: 'WARNING', ph: 'WARNING', temperature: 'WARNING' } },
  { label: 'Only pH recovers; DO and temperature stay open', values: { ph: 7.4 }, expect: { ph: 'NORMAL' } },
  { label: 'Only temperature recovers; DO stays open', values: { temperature: 27 }, expect: { temperature: 'NORMAL' } },
  { label: 'Dissolved oxygen recovers; all clear', values: { dissolved_oxygen: 5.2 }, expect: { dissolved_oxygen: 'NORMAL' } },
];

const BODY_KEY = { dissolved_oxygen: 'dissolvedOxygen', ph: 'ph', temperature: 'temperature' } as const;
const SHORT: Record<Param, string> = { dissolved_oxygen: 'DO', ph: 'pH', temperature: 'Temp' };
const UNIT: Record<Param, string> = { dissolved_oxygen: 'mg/L', ph: '', temperature: '°C' };
const ACTION: Record<string, string> = { opened: 'opened', updated: 'updated', escalated: 'escalated', resolved: 'resolved', none: 'no change' };
type Outcome = { sending: true } | { response: IngestResponse } | { error: string };

export function ParameterDemo({ ponds }: { ponds: TrendPond[] }) {
  const api = useMemo(() => browserApi(), []);
  const db = useDbTarget();
  const [pondId, setPondId] = useState(ponds[0]?.id ?? '');
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [pending, setPending] = useState<number | null>(null);   // step awaiting confirmation
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | { error: string } | null>(null);
  const pond = ponds.find((p) => p.id === pondId);
  const next = PARAMETER_DEMO_STEPS.findIndex((_, i) => !(outcomes[i] && 'response' in outcomes[i]!));

  async function send(i: number) {
    if (busy !== null || !db.canWrite) return;
    const step = PARAMETER_DEMO_STEPS[i]!;
    setBusy(i); setOutcomes((o) => ({ ...o, [i]: { sending: true } }));
    try {
      const body: Parameters<typeof api.demoMeasurement>[0] = { pondId };
      for (const [p, v] of Object.entries(step.values) as [Param, number][]) (body as Record<string, unknown>)[BODY_KEY[p]] = v;
      const response = await api.demoMeasurement(body);
      setOutcomes((o) => ({ ...o, [i]: { response } }));
      try { setAlerts((await api.pondAlerts(pondId, { status: 'OPEN', limit: 20 })).items); } catch (e) { setAlerts({ error: e instanceof ApiError ? e.message : 'Could not load alerts.' }); }
    } catch (e) {
      setOutcomes((o) => ({ ...o, [i]: { error: e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : 'The request failed.' } }));
    } finally { setBusy(null); }
  }
  const request = (i: number) => { if (confirmed) void send(i); else setPending(i); };

  return (
    <Card aria-labelledby="pdemo-title">
      <CardHeader id="pdemo-title" title="Guided demo: dissolved oxygen, pH and temperature" description="Twenty simulated readings you send one at a time. Watch each parameter open, escalate and recover on its own, and several alerts coexist for one pond." />
      <div className="space-y-4 px-5 pb-5 pt-4">
        {db.loading ? <p className="text-[13px] text-ink-soft">Checking which database the API uses.</p>
          : db.canWrite ? <Notice>The API is connected to a <strong className="font-medium">local test database</strong>. Readings are marked simulated and stay on this machine.</Notice>
          : <Notice tone="warning"><strong className="font-medium">The demo is disabled.</strong> It only runs against a verified local database.</Notice>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64"><Field label="Pond">{(id) => <Select id={id} value={pondId} disabled={busy !== null} onChange={(e) => { setPondId(e.target.value); setOutcomes({}); setAlerts(null); }}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field></div>
          <Button variant="primary" disabled={!db.canWrite || !pondId || busy !== null || next === -1} onClick={() => request(next)}>{next === -1 ? 'Sequence complete' : `Send step ${next + 1}`}</Button>
          <Button disabled={busy !== null || !Object.keys(outcomes).length} onClick={() => { setOutcomes({}); setAlerts(null); }}>Clear results</Button>
        </div>
        <p className="text-xs leading-relaxed text-ink-soft">Send steps in order, or any step on its own. Classifications and alert results below are the server&apos;s responses; a row is flagged if the server&apos;s answer differs from what the script expects. After a full run, send step 1 again to start over from a clean state.</p>

        <Table caption="Guided multi-parameter demo steps and server responses" className="min-w-[860px]">
          <thead><tr><Th>Step</Th><Th>Reading sent</Th><Th>Expected</Th><Th>Server classification</Th><Th>Alert changes</Th><Th className="text-right"><span className="sr-only">Send</span></Th></tr></thead>
          <tbody>
            {PARAMETER_DEMO_STEPS.map((s, i) => {
              const o = outcomes[i]; const res = o && 'response' in o ? o.response : null;
              return (
                <Tr key={i}>
                  <Td className="whitespace-nowrap"><span className="font-medium">{i + 1}</span></Td>
                  <Td className="tabular-nums">{(Object.entries(s.values) as [Param, number][]).map(([p, v]) => <span key={p} className="mr-3 whitespace-nowrap"><span className="text-ink-soft">{SHORT[p]}</span> {formatValue(v, p)}{UNIT[p] ? ` ${UNIT[p]}` : ''}</span>)}</Td>
                  <Td className="text-ink-soft">{s.label}</Td>
                  <Td>
                    {o && 'sending' in o ? <StatusPill tone="neutral">Sending</StatusPill>
                      : o && 'error' in o ? <p role="alert" className="max-w-[26ch] text-xs text-crit-text">Failed: {o.error}</p>
                      : res ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(s.values) as Param[]).map((p) => { const r = res.risk[p]?.status as string | undefined; const ok = r === s.expect[p]; const known = r === 'NORMAL' || r === 'WARNING' || r === 'CRITICAL';
                            return <span key={p} className="inline-flex items-center gap-1 text-xs"><span className="text-ink-soft">{SHORT[p]}</span>{known ? <StatusPill tone={RISK_TONE[r as Risk]}>{RISK_LABEL[r as Risk]}</StatusPill> : <StatusPill tone="muted">{r ?? 'n/a'}</StatusPill>}{!ok ? <span className="text-warn-text">expected {s.expect[p] ? RISK_LABEL[s.expect[p]!] : 'n/a'}</span> : null}</span>; })}
                        </div>
                      ) : <span className="text-ink-soft">Not sent</span>}
                  </Td>
                  <Td className="text-xs">{res ? (res.alerts.filter((a) => a.action !== 'none').length ? res.alerts.filter((a) => a.action !== 'none').map((a, k) => <span key={k} className="block">{PARAM_LABEL[a.parameter] ?? a.parameter}{a.direction && a.parameter !== 'dissolved_oxygen' ? ` (${a.direction})` : ''}: {ACTION[a.action] ?? a.action}</span>) : <span className="text-ink-soft">No alert change</span>) : <span className="text-ink-soft">n/a</span>}</Td>
                  <Td className="text-right"><Button size="sm" disabled={!db.canWrite || busy !== null} onClick={() => request(i)}>{res ? 'Send again' : 'Send'}</Button></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>

        <div>
          <h3 className="text-[13px] font-medium text-ink">Unresolved alerts for {pond?.name ?? 'this pond'} (live from the API)</h3>
          {alerts === null ? <p className="mt-2 text-xs text-ink-soft">Shown after the first reading is sent.</p>
            : 'error' in alerts ? <p role="alert" className="mt-2 text-xs text-crit-text">Could not load alerts: {alerts.error}</p>
            : alerts.length === 0 ? <p className="mt-2 text-xs text-ink-soft">No unresolved alerts for this pond.</p>
            : <div className="mt-2"><AlertCardList alerts={alerts} pondNames={{ [pondId]: pond?.name ?? '' }} /></div>}
        </div>
      </div>

      <ConfirmDialog open={pending !== null} title="Send simulated readings?" confirmLabel="Send reading" onConfirm={() => { const i = pending!; setPending(null); setConfirmed(true); void send(i); }} onCancel={() => setPending(null)}>
        <p>Each step saves one reading marked <strong className="font-medium text-ink">simulated</strong> for <strong className="font-medium text-ink">{pond?.name}</strong> on the connected local test database, and can open, escalate or resolve alerts for that pond. Readings can&apos;t be deleted from this screen. You will not be asked again on this page.</p>
      </ConfirmDialog>
    </Card>
  );
}
