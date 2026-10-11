'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { CaretDown, CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { alertSeverityCounts } from '@/lib/fleet';
import { DEFAULT_UNIT, PARAM_LABEL, fmtThreshold, formatDateTime, formatValue, horizonLabel } from '@/lib/format';
import { ALERT_STATUS_LABEL, ALERT_STATUS_TONE, SEVERITY_TONE } from '@/lib/status';
import { Card, CardHeader } from '../ui/Card';
import { Field, Select } from '../ui/Field';
import { Button, linkButtonClass } from '../ui/Button';
import { TableSkeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '../ui/states';
import { SourceBadge, StatusPill } from '../ui/StatusPill';
import { Table, Td, Th, Tr } from '../ui/Table';
import { cx } from '../ui/cx';

type StatusFilter = 'OPEN' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ALL';
const PAGE = 50;

export function AlertsCenter({ ponds, initialPondId = '' }: { ponds: { id: string; name: string }[]; initialPondId?: string }) {
  const api = useMemo(() => browserApi(), []);
  const names = useMemo(() => Object.fromEntries(ponds.map((p) => [p.id, p.name])), [ponds]);
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [origin, setOrigin] = useState<'' | 'observed' | 'predicted'>('');
  const [pondId, setPondId] = useState(initialPondId);
  const [severity, setSeverity] = useState<'' | 'CRITICAL' | 'WARNING'>('');
  const [parameter, setParameter] = useState('');

  // Counts always describe ALL unresolved alerts, independent of the table filters.
  const open = useApiQuery((s) => api.alerts({ status: 'OPEN', limit: 1000 }, s), []);
  const first = useApiQuery((s) => api.alerts({ status, origin: origin || undefined, pondId: pondId || undefined, limit: PAGE }, s), [status, origin, pondId]);

  // Extra pages and local acknowledgements belong to one first-page response; a new response (new filters or reload) discards them.
  interface Tail { base: unknown; items: Alert[]; cursor: string | null; patched: Record<string, Alert>; loading: boolean; error: unknown }
  const [tailState, setTailState] = useState<Tail | null>(null);
  const tail: Tail = tailState && tailState.base === first.data ? tailState : { base: first.data, items: [], cursor: first.data?.nextCursor ?? null, patched: {}, loading: false, error: null };
  const { cursor, patched, loading: moreLoading, error: moreError } = tail;
  const update = (patch: Partial<Tail>) => setTailState({ ...tail, ...patch });

  async function loadMore() {
    if (!cursor) return;
    update({ loading: true, error: null });
    try {
      const r = await api.alerts({ status, origin: origin || undefined, pondId: pondId || undefined, limit: PAGE, cursor });
      setTailState({ ...tail, items: [...tail.items, ...r.items], cursor: r.nextCursor, loading: false, error: null });
    } catch (error) { setTailState({ ...tail, loading: false, error }); }
  }

  const loaded = useMemo(() => [...(first.data?.items ?? []), ...tail.items].map((a) => patched[a.id] ?? a), [first.data, tail.items, patched]);
  const rows = loaded.filter((a) => (!severity || a.severity === severity) && (!parameter || a.parameter === parameter));
  const counts = open.data ? alertSeverityCounts(open.data.items) : null;
  const params = [...new Set(loaded.map((a) => a.parameter))];

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function acknowledge(a: Alert) {
    setBusy(a.id); setFeedback(null);
    try {
      const r = await api.acknowledgeAlert(a.id);
      setTailState({ ...tail, patched: { ...tail.patched, [a.id]: r.alert } });
      setFeedback({ kind: 'ok', text: r.changed ? `Alert acknowledged. It remains open until readings recover.` : 'This alert was already acknowledged.' });
      open.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'The alert could not be acknowledged.';
      setFeedback({ kind: 'error', text: e instanceof ApiError && e.status === 409 ? `${msg} Refresh to see its current state.` : msg });
    } finally { setBusy(null); }
  }

  const clientFiltered = Boolean(severity || parameter);
  return (
    <div className="space-y-6">
      <section aria-label="Unresolved alert counts" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([['Unresolved', counts ? `${open.data!.count}${open.data!.nextCursor ? '+' : ''}` : null, 'text-ink'], ['Critical', counts?.critical, 'text-crit-text'], ['Warning', counts?.warning, 'text-warn-text'], ['Acknowledged', counts?.acknowledged, 'text-olive-text']] as const).map(([label, n, cls]) => (
          <Card key={label} className="p-5"><p className="text-[13px] text-ink-soft">{label}</p><p className={cx('mt-2 text-3xl font-medium leading-none tabular-nums', cls)}>{open.loading && !open.data ? <span className="skeleton inline-block h-7 w-10 align-middle" aria-label="Loading" /> : open.error ? 'n/a' : (n ?? 'n/a')}</p></Card>
        ))}
      </section>
      {open.error ? <Notice tone="warning">Unresolved alert counts could not be loaded. <button type="button" onClick={open.reload} className="underline">Retry</button></Notice> : null}

      <Card aria-labelledby="al-title">
        <CardHeader id="al-title" title="Alerts" description="Acknowledging an alert marks it as seen. It stays open until readings or forecasts return to normal." />
        <form className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()} aria-label="Alert filters">
          <Field label="Status">{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}><option value="OPEN">Unresolved</option><option value="ACTIVE">Active</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option><option value="ALL">All</option></Select>}</Field>
          <Field label="Pond">{(id) => <Select id={id} value={pondId} onChange={(e) => setPondId(e.target.value)}><option value="">All ponds</option>{ponds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
          <Field label="Type">{(id) => <Select id={id} value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)}><option value="">Observed and forecast</option><option value="observed">Observed</option><option value="predicted">Forecast</option></Select>}</Field>
          <Field label="Severity">{(id) => <Select id={id} value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}><option value="">Any severity</option><option value="CRITICAL">Critical</option><option value="WARNING">Warning</option></Select>}</Field>
          <Field label="Parameter">{(id) => <Select id={id} value={parameter} onChange={(e) => setParameter(e.target.value)}><option value="">Any parameter</option>{params.map((p) => <option key={p} value={p}>{PARAM_LABEL[p] ?? p}</option>)}</Select>}</Field>
        </form>
        <p className="px-5 pt-2 text-xs text-ink-soft">Status, pond and type filter on the server. Severity and parameter filter the alerts loaded below.</p>

        <div aria-live="polite" className="px-5 pt-3">
          {feedback ? (
            <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px]', feedback.kind === 'ok' ? 'bg-ok-bg text-ok-text' : 'bg-crit-bg text-crit-text')}>
              {feedback.kind === 'ok' ? <CheckCircle size={16} className="mt-px shrink-0" aria-hidden="true" /> : null}<span>{feedback.text}</span>
            </div>
          ) : null}
        </div>

        <div className="pt-3">
          {first.loading && !first.data ? <TableSkeleton rows={5} cols={6} />
            : first.error ? <ErrorState error={first.error} title="Could not load alerts" onRetry={first.reload} />
            : rows.length === 0 ? (
              <EmptyState title={loaded.length ? 'No alerts match these filters' : status === 'OPEN' ? 'No unresolved alerts' : 'No alerts found'}>
                {loaded.length ? 'Clear the severity or parameter filter to see the loaded alerts.' : status === 'OPEN' ? 'Every pond is currently within its dissolved-oxygen limits, or has no recent data to evaluate. Alerts appear when a reading or forecast crosses a threshold.' : 'Nothing matches the selected status, pond and type.'}
              </EmptyState>
            ) : (
              <Table caption="Alerts" className="min-w-[860px]">
                <thead><tr><Th>Severity</Th><Th>Pond</Th><Th>Condition</Th><Th>Status</Th><Th>Created</Th><Th>Last update</Th><Th className="text-right"><span className="sr-only">Actions</span></Th></tr></thead>
                <tbody>
                  {rows.map((a) => {
                    const isOpen = expanded === a.id;
                    const unit = DEFAULT_UNIT[a.parameter] ?? '';
                    return (
                      <Fragment key={a.id}>
                        <Tr>
                          <Td><StatusPill tone={SEVERITY_TONE[a.severity]}>{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</StatusPill></Td>
                          <Td><Link href={`/ponds/${a.pondId}`} className="font-medium hover:text-olive-text hover:underline">{names[a.pondId] ?? 'Unknown pond'}</Link></Td>
                          <Td>
                            <p>{PARAM_LABEL[a.parameter] ?? a.parameter} <span className="text-ink-soft">{a.origin === 'predicted' ? `forecast ${formatValue(a.triggerValue, a.parameter)} ${unit} in ${horizonLabel(a.horizonMinutes)}` : `observed ${formatValue(a.triggerValue, a.parameter)} ${unit}`}</span></p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft"><span>{a.origin === 'predicted' ? 'Forecast' : 'Observed'}, threshold {fmtThreshold(a.threshold)} {unit}</span>{a.dataSource ? <SourceBadge source={a.dataSource} /> : null}</p>
                          </Td>
                          <Td><StatusPill tone={ALERT_STATUS_TONE[a.status]}>{ALERT_STATUS_LABEL[a.status]}</StatusPill></Td>
                          <Td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDateTime(a.createdAt)}</Td>
                          <Td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDateTime(a.lastTriggeredAt)}</Td>
                          <Td className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {a.status === 'ACTIVE' ? <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => acknowledge(a)}>{busy === a.id ? 'Acknowledging' : 'Acknowledge'}</Button> : null}
                              <button type="button" aria-expanded={isOpen} aria-controls={`detail-${a.id}`} aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${names[a.pondId] ?? 'alert'}`} onClick={() => setExpanded(isOpen ? null : a.id)} className="flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink"><CaretDown size={16} aria-hidden="true" className={cx('transition-transform duration-150', isOpen && 'rotate-180')} /></button>
                            </div>
                          </Td>
                        </Tr>
                        {isOpen ? (
                          <tr id={`detail-${a.id}`} className="bg-surface/50">
                            <td colSpan={7} className="border-b border-line/70 px-5 py-4">
                              <p className="mb-3 text-[13px] text-ink">{a.message}</p>
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-4">
                                {[
                                  ['Created', formatDateTime(a.createdAt)], ['Last triggered', formatDateTime(a.lastTriggeredAt)],
                                  ['Acknowledged', a.acknowledgedAt ? formatDateTime(a.acknowledgedAt) : 'Not acknowledged'], ['Resolved', a.resolvedAt ? formatDateTime(a.resolvedAt) : 'Still open'],
                                  ...(a.forecastFor ? [['Forecast for', formatDateTime(a.forecastFor)]] : []),
                                ].map(([k, v]) => <div key={k}><dt className="text-ink-soft">{k}</dt><dd className="mt-0.5 tabular-nums text-ink">{v}</dd></div>)}
                                <div><dt className="text-ink-soft">Data source</dt><dd className="mt-1">{a.dataSource ? <SourceBadge source={a.dataSource} /> : 'n/a'}</dd></div>
                                <div><dt className="text-ink-soft">Alert ID</dt><dd className="mt-0.5 break-all font-mono text-[11px] text-ink">{a.id}</dd></div>
                              </dl>
                              <div className="mt-3"><Link href={`/ponds/${a.pondId}`} className={linkButtonClass('secondary', 'sm')}>Open pond</Link></div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
            )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-ink-soft">
            <span aria-live="polite">{loaded.length ? `Showing ${rows.length}${clientFiltered ? ` of ${loaded.length} loaded` : ''} alerts${cursor ? ', more available' : ''}.` : ''}</span>
            {cursor ? <Button size="sm" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Loading' : 'Load more'}</Button> : null}
          </div>
          {moreError ? <div className="px-5 pb-4"><Notice tone="warning">More alerts could not be loaded. <button type="button" className="underline" onClick={loadMore}>Retry</button></Notice></div> : null}
        </div>
      </Card>
    </div>
  );
}
