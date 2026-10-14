'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, CircleNotch, MinusCircle, WarningCircle, Circle } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert, FarmerNote, HealthResponse } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Field, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { Notice } from '../ui/states';
import { cx } from '../ui/cx';
import { AlertCardList } from './AlertCard';

interface Step { dissolvedOxygen: number; ph: number; temperature: number; minutesAgo: number }
const NORMAL = { dissolvedOxygen: 5.5, ph: 7.5, temperature: 27 };
const SCENARIOS = [
  { id: 'multi', title: 'Critical, several factors', desc: 'Oxygen 1.5 mg/L, pH 9.4 and temperature 36 °C at once. Shows the priority order, the Jev analysis and the LLM solution.', steps: [{ dissolvedOxygen: 1.5, ph: 9.4, temperature: 36, minutesAgo: 0 }] },
  { id: 'oxygen', title: 'Critical oxygen only', desc: 'Oxygen drops to 1.5 mg/L, everything else normal. A single critical alert with a written solution.', steps: [{ dissolvedOxygen: 1.5, ph: 7.4, temperature: 27, minutesAgo: 0 }] },
  { id: 'glitch', title: 'Sudden sensor glitch', desc: 'Three steady readings, then oxygen falls to 0.4 mg/L in one step while pH and temperature stay steady. Jev should suspect the sensor.', steps: [
    { ...NORMAL, minutesAgo: 30 }, { ...NORMAL, minutesAgo: 20 }, { ...NORMAL, minutesAgo: 10 }, { dissolvedOxygen: 0.4, ph: 7.5, temperature: 27, minutesAgo: 0 }] },
] satisfies { id: string; title: string; desc: string; steps: Step[] }[];

type Phase = 'idle' | 'sending' | 'waiting' | 'done' | 'timeout' | 'failed';
interface Run { scenario: string; phase: Phase; alerts: Alert[]; error?: string; seconds: number }
const POLL_MS = 2000; const TIMEOUT_S = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Row({ state, title, children }: { state: 'todo' | 'running' | 'done' | 'warn' | 'fail' | 'skip'; title: string; children?: React.ReactNode }) {
  const icon = state === 'done' ? <CheckCircle size={18} weight="fill" className="text-ok-text" /> : state === 'running' ? <CircleNotch size={18} className="animate-spin text-olive-text" />
    : state === 'warn' ? <WarningCircle size={18} weight="fill" className="text-warn-text" /> : state === 'fail' ? <WarningCircle size={18} weight="fill" className="text-crit-text" />
    : state === 'skip' ? <MinusCircle size={18} className="text-ink-soft" /> : <Circle size={18} className="text-ink-soft" />;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className="mt-px shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0"><p className="text-sm font-medium text-ink">{title}</p>{children ? <p className="mt-0.5 text-[13px] text-ink-soft">{children}</p> : null}</div>
    </li>
  );
}

/** Creates a critical situation on a pond and shows, step by step, how the alert, Jev and the LLM responded. Also tries a field note. */
export function AdvisorTestLab({ ponds }: { ponds: { id: string; name: string }[] }) {
  const api = useMemo(() => browserApi(), []);
  const health = useApiQuery((s) => api.health(s), []);
  const [pondId, setPondId] = useState(ponds[0]?.id ?? '');
  const [run, setRun] = useState<Run | null>(null);
  const cancel = useRef(false);
  useEffect(() => () => { cancel.current = true; }, []);
  const h: HealthResponse | null = health.data;
  const pondName = ponds.find((p) => p.id === pondId)?.name ?? '';
  const busy = run?.phase === 'sending' || run?.phase === 'waiting';
  const demoOn = h?.demo?.enabled === true;

  async function start(id: string) {
    const sc = SCENARIOS.find((s) => s.id === id)!;
    cancel.current = false;
    setRun({ scenario: id, phase: 'sending', alerts: [], seconds: 0 });
    // Use the server's clock for timestamps so a wrong laptop clock cannot make a reading "from the future".
    const serverNow = () => Date.now() + (h ? Date.parse(h.time) - Date.now() : 0);
    const began = serverNow();
    try {
      // Return to normal first, so the critical alert is a fresh one (an alert that is already open is not announced again).
      await api.demoMeasurement({ pondId, dissolvedOxygen: NORMAL.dissolvedOxygen, ph: NORMAL.ph, temperature: NORMAL.temperature, recordedAt: new Date(serverNow() - 40 * 60000 - 1000).toISOString() });
      for (const st of sc.steps) await api.demoMeasurement({ pondId, dissolvedOxygen: st.dissolvedOxygen, ph: st.ph, temperature: st.temperature, recordedAt: new Date(serverNow() - st.minutesAgo * 60000).toISOString() });
    } catch (e) {
      setRun({ scenario: id, phase: 'failed', alerts: [], seconds: 0, error: e instanceof ApiError ? e.message : 'Could not send the test reading.' });
      return;
    }
    setRun((r) => r && { ...r, phase: 'waiting' });
    for (let t = 0; t <= TIMEOUT_S * 1000 && !cancel.current; t += POLL_MS) {
      try {
        const page = await api.pondAlerts(pondId, { status: 'OPEN', origin: 'observed', limit: 20 });
        const mine = page.items.filter((a) => Date.parse(a.createdAt) >= began - 3000);
        const critical = mine.filter((a) => a.severity === 'CRITICAL');
        const finished = critical.length > 0 && critical.every((a) => a.advisory);
        setRun({ scenario: id, phase: finished ? 'done' : 'waiting', alerts: mine, seconds: Math.round(t / 1000) });
        if (finished) return;
      } catch { /* keep polling: a single failed poll is not a failed test */ }
      await sleep(POLL_MS);
    }
    if (!cancel.current) setRun((r) => r && { ...r, phase: 'timeout' });
  }

  async function reset() {
    setRun(null);
    try { await api.demoMeasurement({ pondId, dissolvedOxygen: NORMAL.dissolvedOxygen, ph: NORMAL.ph, temperature: NORMAL.temperature }); } catch { /* shown by the next health/alert refresh */ }
  }

  const crit = run?.alerts.filter((a) => a.severity === 'CRITICAL') ?? [];
  const adv = crit.find((a) => a.advisory)?.advisory;
  const waiting = run?.phase === 'waiting' || run?.phase === 'sending';
  const llmWhy = adv?.guard?.reasons.length ? adv.guard.reasons.join('; ') : adv?.errors?.length ? adv.errors.join(', ') : 'no LLM answer was produced';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-olive/60 bg-sage-pale px-4 py-3 text-[13px] text-olive-text" role="note">
        <span className="mr-2 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold tracking-wide">TEST</span>
        These buttons save made-up “Test data” readings to the pond you choose and open a real alert on it. Use a pond you do not mind showing a test alert, and stop the simulator while testing so it does not overwrite the test readings. “Return to normal” closes the test alerts.
      </div>

      <Card aria-labelledby="t-status">
        <CardHeader id="t-status" title="Is everything switched on?" description="What the backend reports about the test and assistant settings." />
        <CardBody>
          {health.error ? <Notice tone="warning">The backend could not be reached. Start it and refresh.</Notice> : (
            <ul className="divide-y divide-line">
              <Row state={h ? 'done' : 'running'} title="Backend reachable" />
              <Row state={h ? (demoOn ? 'done' : 'fail') : 'todo'} title="Test readings allowed">{h && !demoOn ? 'Set DEMO_ENABLED=true in backend/.env and restart the backend.' : null}</Row>
              <Row state={h ? (h.ai?.advisor ? 'done' : 'fail') : 'todo'} title="Jev analysis configured">{h && !h.ai?.advisor ? 'Set TYPESAFE_API_KEY (or JEV_API_KEY) in backend/.env and restart the backend.' : null}</Row>
              <Row state={h ? (h.ai?.llm ? 'done' : 'warn') : 'todo'} title="LLM endpoint configured">{h && !h.ai?.llm ? 'Set LLM_ENDPOINT_URL (and LLM_API_KEY, LLM_MODEL) in backend/.env. Without it the standard guidance is used.' : null}</Row>
            </ul>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="t-run">
        <CardHeader id="t-run" title="Create a critical situation" description="Pick a pond and a situation. The page then follows the alert through Jev and the LLM." />
        <CardBody className="space-y-4">
          <div className="max-w-sm">
            <Field label="Pond for the test">{(id) => <Select id={id} value={pondId} disabled={busy} onChange={(e) => setPondId(e.target.value)}>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            {SCENARIOS.map((s) => (
              <li key={s.id} className={cx('flex flex-col justify-between gap-3 rounded-lg border bg-card p-3.5', run?.scenario === s.id ? 'border-olive' : 'border-line')}>
                <div><p className="text-sm font-semibold text-ink">{s.title}</p><p className="mt-1 text-[13px] text-ink-soft">{s.desc}</p></div>
                <Button variant="primary" size="sm" disabled={busy || !demoOn || !pondId} onClick={() => void start(s.id)}>{busy && run?.scenario === s.id ? 'Running' : 'Run this test'}</Button>
              </li>
            ))}
          </ul>
          <div><Button size="sm" disabled={busy || !demoOn} onClick={() => void reset()}>Return {pondName} to normal</Button></div>
        </CardBody>
      </Card>

      {run ? (
        <Card aria-labelledby="t-result" aria-live="polite">
          <CardHeader id="t-result" title="What happened" description={`${SCENARIOS.find((s) => s.id === run.scenario)?.title} on ${pondName}${waiting ? ` · waiting ${run.seconds}s` : ''}`} />
          <CardBody className="space-y-4">
            {run.phase === 'failed' ? <Notice tone="warning">{run.error}</Notice> : null}
            <ol className="divide-y divide-line rounded-lg border border-line px-3.5">
              <Row state={run.phase === 'sending' ? 'running' : run.phase === 'failed' ? 'fail' : 'done'} title="1. Test readings saved" />
              <Row state={crit.length ? 'done' : waiting ? 'running' : 'fail'} title="2. Critical alert opened by the safety limits">{crit.length ? crit.map((a) => `${a.parameter.replace('_', ' ')} ${a.direction ?? ''}`).join(', ') : run.phase === 'timeout' ? 'No critical alert appeared. Is the pond’s data source or the limits different from the test values?' : null}</Row>
              <Row state={adv ? (adv.analysedBy === 'jev' ? 'done' : 'warn') : waiting && crit.length ? 'running' : 'todo'} title="3. Jev ranked the factors and checked the sensor">
                {adv ? (adv.analysedBy === 'jev' ? `Model ${adv.jevModel ?? 'jev'}. First priority: ${adv.firstPriority?.replace('_', ' ') ?? 'n/a'}. Suggested channel: ${adv.notify.channel}.${adv.sensorFault ? ` Sensor-fault chance ${Math.round(adv.sensorFault.probability * 100)}%${adv.sensorFault.flagged ? ' (flagged)' : ''}.` : ''}` : `Jev was not available (${adv.errors?.join(', ') ?? 'no reason given'}). Rule-based order used.`) : null}
              </Row>
              <Row state={adv?.solution ? (adv.solution.source === 'llm' ? 'done' : 'warn') : waiting && crit.length ? 'running' : 'todo'} title="4. LLM wrote the solution">
                {adv?.solution ? (adv.solution.source === 'llm' ? `Written by ${adv.llmModel ?? 'the LLM'}.` : `Standard guidance shown instead: ${llmWhy}.`) : null}
              </Row>
              <Row state={adv?.guard ? (adv.guard.passed ? 'done' : 'warn') : adv?.solution ? 'skip' : waiting && crit.length ? 'running' : 'todo'} title="5. Jev checked the LLM’s advice">
                {adv?.guard ? (adv.guard.passed ? 'Passed: does not claim the pond is safe, gives no doses, follows the priority.' : `Blocked: ${adv.guard.reasons.join('; ')}.`) : adv?.solution ? 'Skipped: no LLM answer to check.' : null}
              </Row>
            </ol>
            {run.phase === 'timeout' ? <Notice tone="warning">No result after {TIMEOUT_S} seconds. Look for “[ADVISOR]” lines in the backend terminal and check the three switches above.</Notice> : null}
            {run.alerts.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">The alerts, as the rest of the app shows them</p>
                <AlertCardList alerts={run.alerts} pondNames={{ [pondId]: pondName }} />
                {adv ? <details className="rounded-lg border border-line bg-surface px-3 py-2 text-xs"><summary className="cursor-pointer font-medium text-ink">Raw assistant result</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-ink-soft">{JSON.stringify(adv, null, 2)}</pre></details> : null}
                <p className="text-[13px]"><Link href={`/ponds/${pondId}`} className="text-olive-text underline-offset-2 hover:underline">Open the pond page</Link> · <Link href="/alerts" className="text-olive-text underline-offset-2 hover:underline">Open Alerts</Link></p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <NoteTest pondId={pondId} pondName={pondName} />
    </div>
  );
}

function NoteTest({ pondId, pondName }: { pondId: string; pondName: string }) {
  const api = useMemo(() => browserApi(), []);
  const [text, setText] = useState('Fish gulping at the surface near the inlet this morning');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<FarmerNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true); setError(null); setNote(null);
    try { setNote(await api.addNote(pondId, text.trim())); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save the note.'); } finally { setBusy(false); }
  }
  return (
    <Card aria-labelledby="t-note">
      <CardHeader id="t-note" title="Try a field note" description={`Saves a note on ${pondName} and shows how Jev sorted it. Notes never raise or close an alert.`} />
      <CardBody className="space-y-3">
        <label htmlFor="t-note-text" className="text-[13px] font-medium text-ink">Note</label>
        <textarea id="t-note-text" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus-visible:border-olive" />
        <Button variant="primary" size="sm" disabled={busy || text.trim().length < 3} onClick={() => void send()}>{busy ? 'Saving' : 'Save and sort this note'}</Button>
        {error ? <p role="alert" className="text-[13px] text-crit-text">{error}</p> : null}
        {note ? (
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3" aria-label="How the note was sorted">
            <div><dt className="text-ink-soft">Category</dt><dd className="font-medium text-ink">{note.category}{note.categoryConfidence !== undefined ? ` (${Math.round(note.categoryConfidence * 100)}% sure)` : ''}</dd></div>
            <div><dt className="text-ink-soft">Distress chance</dt><dd className="font-medium text-ink">{note.distress !== undefined ? `${Math.round(note.distress * 100)}%` : 'not sorted'}</dd></div>
            <div><dt className="text-ink-soft">Seriousness (0 to 2)</dt><dd className="font-medium text-ink">{note.severityScore !== undefined ? note.severityScore.toFixed(1) : 'not sorted'}</dd></div>
          </dl>
        ) : null}
      </CardBody>
    </Card>
  );
}
