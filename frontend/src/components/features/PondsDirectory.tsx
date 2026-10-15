'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr';
import type { FleetRow } from '@/lib/fleet';
import { sortRows } from '@/lib/fleet';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/states';
import { PondCard } from './PondCard';
import { cx } from '../ui/cx';
import { DataSourceToggle } from './DataSourceToggle';

const allSame = (rows: FleetRow[]): 'sensor' | 'simulator' | 'mixed' => { const set = new Set(rows.map((r) => r.pond.dataSource ?? 'sensor')); return set.size === 1 ? [...set][0]! : 'mixed'; };
const STATUS_FILTERS = ['ALL', 'CRITICAL', 'WARNING', 'NORMAL', 'STALE', 'NO_DATA'] as const;
const FILTER_LABEL: Record<(typeof STATUS_FILTERS)[number], string> = { ALL: 'All', CRITICAL: 'Urgent', WARNING: 'Attention', NORMAL: 'Healthy', STALE: 'No recent reading', NO_DATA: 'No data yet' };

export function PondsDirectory({ rows, initialQuery = '' }: { rows: FleetRow[]; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [sort, setSort] = useState<'attention' | 'name'>('attention');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = rows.filter((r) => (!term || r.pond.name.toLowerCase().includes(term) || r.pond.id.toLowerCase().includes(term) || (r.pond.sourceId ?? '').toLowerCase().includes(term)) && (status === 'ALL' || r.risk === status));
    list = sort === 'name' ? [...list].sort((a, b) => a.pond.name.localeCompare(b.pond.name, undefined, { numeric: true })) : sortRows(list);
    return list;
  }, [rows, q, status, sort]);

  const filtered = q.trim() !== '' || status !== 'ALL';
  return (
    <Card aria-labelledby="dir-title">
      <CardHeader id="dir-title" title="Your ponds" description={<span aria-live="polite">{filtered ? `${shown.length} of ${rows.length} ponds match` : `${rows.length} ponds`}</span>} />
      {rows.length ? (
        <div className="flex flex-wrap gap-2 px-5 pt-4" role="group" aria-label="Show ponds by condition">
          {STATUS_FILTERS.map((f) => {
            const n = f === 'ALL' ? rows.length : rows.filter((r) => r.risk === f).length;
            if (n === 0 && f !== 'ALL' && f !== status) return null;
            return (
              <button key={f} type="button" aria-pressed={status === f} onClick={() => setStatus(f)}
                className={cx('inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium', status === f ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:bg-surface')}>
                {FILTER_LABEL[f]} <span className={cx('tabular-nums', status === f ? 'text-white/90' : 'text-ink-soft')}>{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <form className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-[minmax(0,1fr)_200px]" role="search" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search ponds" hint="Name or identifier">
          {(id, d) => (
            <div className="relative">
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
              <Input id={id} aria-describedby={d} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" autoComplete="off" />
            </div>
          )}
        </Field>
        <Field label="Sort by">{(id) => <Select id={id} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="attention">Needs attention first</option><option value="name">Name</option></Select>}</Field>
      </form>
      <div className="pt-4">
        {rows.length === 0 ? (
          <EmptyState title="No ponds yet">Ponds appear here once they are registered or imported into the database.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="No ponds match" action={<Button size="sm" onClick={() => { setQ(''); setStatus('ALL'); }}><X size={14} aria-hidden="true" />Clear filters</Button>}>
            No pond matches {q.trim() ? `"${q.trim()}"` : 'the selected status'}. Check the spelling or clear the filters.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Ponds">{shown.map((r) => <li key={r.pond.id}><PondCard row={r} /></li>)}</ul>
        )}
      </div>
      {rows.length ? (
        <details className="border-t border-line px-5 py-3">
          <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-medium text-ink">Advanced: where readings come from</summary>
          <div className="pt-2"><DataSourceToggle scope="all" value={allSame(rows)} /></div>
        </details>
      ) : null}
      <p className="border-t border-line px-5 pb-4 pt-3 text-sm text-ink-soft">A pond&apos;s status is the most serious current condition among dissolved oxygen, pH and temperature. Open a pond to see what is wrong and what may happen next. <Link href="/alerts" className="text-brand-text underline-offset-2 hover:underline">See all alerts</Link></p>
    </Card>
  );
}
