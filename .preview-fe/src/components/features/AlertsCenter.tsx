'use client';
import { useMemo, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { ALERT_PARAMETERS } from '@/lib/alerts';
import { PARAM_LABEL } from '@/lib/format';
import { Card, CardHeader } from '../ui/Card';
import { Field, Segmented, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { cx } from '../ui/cx';
import { AlertCardList } from './AlertCard';

type Tab = 'OPEN' | 'RESOLVED';
const PAGE = 30;
const EMPTY: Record<Tab, { title: string; body: string }> = {
  OPEN: { title: 'No open problems', body: 'Every pond is within its acceptable range, or has no recent reading to check. Problems appear here as soon as a reading or forecast crosses a limit.' },
  RESOLVED: { title: 'No resolved problems', body: 'Problems whose readings have returned to normal are kept here as history.' },
};

/** Every alert in one place: what is open now (including problems you have already seen) and what has been resolved. The bell badge counts the same open alerts. */
export function AlertsCenter({ ponds, initialPondId = '' }: { ponds: { id: string; name: string }[]; initialPondId?: string }) {
  const api = useMemo(() => browserApi(), []);
  const names = useMemo(() => Object.fromEntries(ponds.map((p) => [p.id, p.name])), [ponds]);
  const [tab, setTab] = useState<Tab>('OPEN');
  const [pondId, setPondId] = useState(initialPondId);
  const [parameter, setParameter] = useState('');
  const [severity, setSeverity] = useState<'' | 'CRITICAL' | 'WARNING'>('');
  const [kind, setKind] = useState<'' | 'observed' | 'predicted'>('');

  // Tab counts always describe ALL unresolved alerts, whatever the filters.
  const open = useApiQuery((s) => api.alerts({ status: 'OPEN', limit: 1000 }, s), []);
  const filters = { status: tab, origin: kind || undefined, parameter: parameter || undefined, severity: severity || undefined, pondId: pondId || undefined };
  const first = useApiQuery((s) => api.alerts({ ...filters, limit: PAGE }, s), [tab, kind, parameter, severity, pondId]);

  // Extra pages and local "seen" changes belong to one first-page response; a new response discards them.
  interface Tail { base: unknown; items: Alert[]; cursor: string | null; patched: Record<string, Alert>; loading: boolean; error: unknown }
  const [tailState, setTailState] = useState<Tail | null>(null);
  const tail: Tail = tailState && tailState.base === first.data ? tailState : { base: first.data, items: [], cursor: first.data?.nextCursor ?? null, patched: {}, loading: false, error: null };
  const loaded = useMemo(() => [...(first.data?.items ?? []), ...tail.items].map((a) => tail.patched[a.id] ?? a), [first.data, tail.items, tail.patched]);

  async function loadMore() {
    if (!tail.cursor) return;
    setTailState({ ...tail, loading: true, error: null });
    try { const r = await api.alerts({ ...filters, limit: PAGE, cursor: tail.cursor }); setTailState({ ...tail, items: [...tail.items, ...r.items], cursor: r.nextCursor, loading: false, error: null }); }
    catch (error) { setTailState({ ...tail, loading: false, error }); }
  }

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  async function markSeen(a: Alert) {
    setBusy(a.id); setFeedback(null);
    try {
      const r = await api.acknowledgeAlert(a.id);
      setTailState({ ...tail, patched: { ...tail.patched, [a.id]: r.alert } });
      setFeedback({ kind: 'ok', text: r.changed ? 'Marked as seen. The problem stays open until readings recover.' : 'This problem was already marked as seen.' });
      open.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not mark this as seen.';
      setFeedback({ kind: 'error', text: e instanceof ApiError && e.status === 409 ? `${msg} Refresh to see its current state.` : msg });
    } finally { setBusy(null); }
  }

  const items = open.data?.items ?? [];
  const openCount = open.data ? items.length : null;
  const current = items.filter((a) => a.origin === 'observed').length;
  const upcoming = items.length - current;
  const filtered = Boolean(pondId || parameter || severity || kind);

  return (
    <div className="space-y-5">
      <Card aria-labelledby="al-title">
        <CardHeader id="al-title" title="Alerts" description="Problems measured in your ponds, and possible problems the forecast expects. A problem stays open until readings recover; “Mark as seen” only tells your team you have noticed it." />
        <div className="space-y-4 px-5 pb-2 pt-4">
          <Segmented<Tab> label="Alert status" value={tab} onChange={setTab} options={[
            { value: 'OPEN', label: `Open${openCount !== null ? ` (${openCount})` : ''}` },
            { value: 'RESOLVED', label: 'Resolved' },
          ]} />
          {open.error ? <Notice tone="warning">The counts could not be loaded. <button type="button" onClick={open.reload} className="underline">Retry</button></Notice>
            : open.data ? <p className="text-xs text-ink-soft" data-testid="alert-breakdown">Right now: {current} current {current === 1 ? 'problem' : 'problems'} and {upcoming} possible upcoming {upcoming === 1 ? 'problem' : 'problems'} (forecasts, not measurements).</p> : null}
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => e.preventDefault()} aria-label="Alert filters">
            <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}><option value="">All ponds</option>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
            <Field label="Measurement">{(id) => <Select id={id} value={parameter} onChange={(e) => setParameter(e.target.value)}><option value="">All factors</option>{ALERT_PARAMETERS.map((p) => <option key={p} value={p}>{PARAM_LABEL[p] ?? p}</option>)}</Select>}</Field>
            <Field label="Severity">{(id) => <Select id={id} value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}><option value="">Any level</option><option value="CRITICAL">Critical only</option><option value="WARNING">Warning only</option></Select>}</Field>
            <Field label="Kind">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="">Current and upcoming</option><option value="observed">Current only</option><option value="predicted">Upcoming only</option></Select>}</Field>
          </form>
        </div>

        <div aria-live="polite" className="px-5 pt-2">
          {feedback ? (
            <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px]', feedback.kind === 'ok' ? 'bg-ok-bg text-ok-text' : 'bg-crit-bg text-crit-text')}>
              {feedback.kind === 'ok' ? <CheckCircle size={16} className="mt-px shrink-0" aria-hidden="true" /> : null}<span>{feedback.text}</span>
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-5 pt-3">
          {first.loading && !first.data ? <div className="space-y-3" aria-label="Loading alerts"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
            : first.error ? <ErrorState error={first.error} title="Could not load alerts" onRetry={first.reload} />
            : loaded.length === 0 ? <EmptyState title={filtered ? 'No alerts match these filters' : EMPTY[tab].title}>{filtered ? 'Try widening the filters.' : EMPTY[tab].body}</EmptyState>
            : <AlertCardList alerts={loaded} pondNames={names} showGuidance={tab !== 'RESOLVED'} onMarkSeen={markSeen} busy={busy !== null} />}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-ink-soft">
            <span aria-live="polite">{loaded.length ? `Showing ${loaded.length} ${loaded.length === 1 ? 'alert' : 'alerts'}${tail.cursor ? ', more available' : ''}.` : ''}</span>
            {tail.cursor ? <Button size="sm" onClick={loadMore} disabled={tail.loading}>{tail.loading ? 'Loading' : 'Show more'}</Button> : null}
          </div>
          {tail.error ? <div className="pt-2"><Notice tone="warning">More alerts could not be loaded. <button type="button" className="underline" onClick={loadMore}>Retry</button></Notice></div> : null}
        </div>
      </Card>
    </div>
  );
}
