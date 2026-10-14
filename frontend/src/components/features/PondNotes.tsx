'use client';
import { useMemo, useState } from 'react';
import { ApiError, browserApi } from '@/lib/api/client';
import { useApiQuery } from '@/lib/useApiQuery';
import { formatDateTime } from '@/lib/format';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/states';
import { cx } from '../ui/cx';

const MAX = 500;
const CATEGORY: Record<string, string> = {
  low_oxygen_signs: 'Signs of low oxygen', disease_signs: 'Signs of disease', feeding_change: 'Feeding change', water_appearance: 'Water appearance',
  equipment_issue: 'Equipment issue', routine_normal: 'Routine, nothing unusual', other: 'Other', unclassified: 'Not sorted',
};

/** Field notes for one pond: what the farmer saw. Jev sorts each note; notes help the alert advisor but never create or change an alert. */
export function PondNotes({ pondId }: { pondId: string }) {
  const api = useMemo(() => browserApi(), []);
  const list = useApiQuery((s) => api.notes(pondId, s), [pondId]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function save() {
    setBusy(true); setError(null);
    try { await api.addNote(pondId, trimmed); setText(''); list.reload(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save the note.'); }
    finally { setBusy(false); }
  }

  return (
    <Card aria-labelledby="notes-title">
      <CardHeader id="notes-title" title="Field notes" description="Write what you saw at the pond, such as fish at the surface, a change in colour or a broken aerator. Notes are sorted automatically and shown to the alert assistant. They never raise or close an alert." />
      <CardBody className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); if (trimmed.length >= 3 && !busy) void save(); }} className="space-y-2">
          <label htmlFor="note-text" className="text-[13px] font-medium text-ink">New note</label>
          <textarea id="note-text" value={text} maxLength={MAX} rows={3} onChange={(e) => setText(e.target.value)} placeholder="For example: Fish gulping at the surface near the inlet this morning"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus-visible:border-olive" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cx('text-xs tabular-nums', text.length > MAX - 40 ? 'text-warn-text' : 'text-ink-soft')}>{text.length}/{MAX}</span>
            <Button variant="primary" size="sm" type="submit" disabled={busy || trimmed.length < 3}>{busy ? 'Saving' : 'Save note'}</Button>
          </div>
          {error ? <p role="alert" className="text-[13px] text-crit-text">{error}</p> : null}
        </form>

        {list.error ? <ErrorState error={list.error} title="Could not load notes" onRetry={list.reload} />
          : list.loading && !list.data ? <Skeleton className="h-16 w-full" />
          : list.data && list.data.items.length === 0 ? <p className="text-[13px] text-ink-soft">No notes for this pond yet.</p>
          : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.data?.items.map((n) => (
                <li key={n.id} className="space-y-1 px-3.5 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink">{CATEGORY[n.category] ?? 'Other'}</span>
                    {n.distress !== undefined && n.distress >= 0.7 ? <span className="rounded-full bg-crit-bg px-2 py-0.5 text-xs font-medium text-crit-text">Possible distress</span> : null}
                    <span className="text-xs text-ink-soft">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-ink">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
      </CardBody>
    </Card>
  );
}
