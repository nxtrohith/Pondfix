'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr';
import type { FleetRow } from '@/lib/fleet';
import { sortRows } from '@/lib/fleet';
import { RISK_LABEL } from '@/lib/status';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/states';
import { PondTable } from './PondTable';

const STATUS_FILTERS = ['ALL', 'NORMAL', 'WARNING', 'CRITICAL', 'STALE', 'NO_DATA'] as const;

export function PondsDirectory({ rows, initialQuery = '' }: { rows: FleetRow[]; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [sort, setSort] = useState<'attention' | 'name'>('attention');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = rows.filter((r) => (!term || r.pond.name.toLowerCase().includes(term) || r.pond.id.toLowerCase().includes(term) || (r.pond.sourceId ?? '').toLowerCase().includes(term)) && (status === 'ALL' || r.risk === status));
    list = sort === 'name' ? [...list].sort((a, b) => a.pond.name.localeCompare(b.pond.name)) : sortRows(list);
    return list;
  }, [rows, q, status, sort]);

  const filtered = q.trim() !== '' || status !== 'ALL';
  return (
    <Card aria-labelledby="dir-title">
      <CardHeader id="dir-title" title="All ponds" description={<span aria-live="polite">{filtered ? `${shown.length} of ${rows.length} ponds match` : `${rows.length} ponds`}</span>} />
      <form className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-[minmax(0,1fr)_180px_180px]" role="search" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search ponds" hint="Name or identifier">
          {(id, d) => (
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
              <Input id={id} aria-describedby={d} type="search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoComplete="off" />
            </div>
          )}
        </Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>{STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : RISK_LABEL[s]}</option>)}</Select>}</Field>
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
          <PondTable rows={shown} caption="All ponds with latest measurements and status" />
        )}
      </div>
      <p className="px-5 pb-4 pt-3 text-xs text-ink-soft">Status is the worst current state across dissolved oxygen, pH and temperature, and a pond with only old readings shows as stale. Open a pond for forecasts and alert history. <Link href="/alerts" className="text-olive-text underline-offset-2 hover:underline">View all alerts</Link></p>
    </Card>
  );
}
