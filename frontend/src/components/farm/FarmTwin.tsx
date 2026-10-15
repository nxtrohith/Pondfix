'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowCounterClockwise, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { FARM, FARM_POND_COUNT, assignSlots, needsAttention, slotLabel, snapshotOf, toneOf, type PondSnapshot } from '@/lib/farm';
import { fleetStats, type FleetRow } from '@/lib/fleet';
import { formatDateTime } from '@/lib/format';
import { POND_STATUS } from '@/lib/terms';
import { Segmented } from '../ui/Field';
import { Notice } from '../ui/states';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { FarmFallback } from './FarmFallback';
import { PondPanel } from './PondPanel';
import { PondTooltip } from './PondTooltip';
import { PondBadge } from './PondBadge';
import type { ScenePond } from './FarmScene';

const SceneSkeleton = () => <div className="flex h-full w-full animate-pulse items-center justify-center bg-surface text-sm text-ink-soft motion-reduce:animate-none" role="status">Loading the farm view…</div>;
const FarmScene = dynamic(() => import('./FarmScene'), { ssr: false, loading: () => <SceneSkeleton /> });

/** True only where a WebGL context can really be created. jsdom and old browsers return false and get the 2D plan instead. */
export function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
let glCache: boolean | null = null;
const noopSubscribe = () => () => {};
/** 'checking' on the server and during hydration, then 'ok' or 'none' once the browser has been asked. */
function useWebgl(): 'checking' | 'ok' | 'none' {
  return useSyncExternalStore(noopSubscribe, () => { glCache ??= webglAvailable(); return glCache ? 'ok' : 'none'; }, () => 'checking');
}
function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(m.matches); on(); m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

/** A rendering error in the 3D scene must never take the Overview down: it falls back to the 2D plan. */
class SceneBoundary extends Component<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('Farm 3D view failed; showing the 2D plan.', e); }
  render() { return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children; }
}

type Filter = 'all' | 'attention';
export interface FarmTwinProps { rows: FleetRow[]; alerts: Alert[]; mode: 'live' | 'demo'; loadedAt: string }

const LEGEND: { tone: 'healthy' | 'warning' | 'critical' | 'unknown'; label: string; mark: string }[] = [
  { tone: 'healthy', label: 'Healthy', mark: '✓' }, { tone: 'warning', label: 'Attention needed', mark: '!' }, { tone: 'critical', label: 'Critical', mark: '!!' }, { tone: 'unknown', label: 'No recent reading', mark: '–' },
];
const SWATCH = { healthy: 'bg-ok-text', warning: 'bg-warn-text', critical: 'bg-crit-text', unknown: 'bg-stale-text' } as const;

export function FarmTwin({ rows, alerts, mode, loadedAt }: FarmTwinProps) {
  const demo = mode === 'demo';
  const assignment = useMemo(() => assignSlots(rows), [rows]);
  const byId = useMemo(() => new Map(assignment.slots.flatMap((r) => (r ? [[r.pond.id, r] as const] : []))), [assignment]);
  const scenePonds: ScenePond[] = useMemo(() => FARM.ponds.map((s) => {
    const row = assignment.slots[s.slot] ?? null;
    return { id: row?.pond.id ?? `empty-${s.slot}`, slot: s.slot, x: s.x, z: s.z, tone: row ? toneOf(row.risk) : 'unknown', label: row ? slotLabel(s.slot) : 'Not registered', attention: row ? needsAttention(row.risk) : false, empty: !row };
  }), [assignment]);
  const names = useMemo(() => Object.fromEntries(assignment.slots.flatMap((r) => (r ? [[r.pond.id, r.pond.name]] : []))), [assignment]);
  const stats = useMemo(() => fleetStats(assignment.slots.filter((r): r is FleetRow => r !== null)), [assignment]);
  const attention = stats.warning + stats.critical;
  const alertsByPond = useMemo(() => { const m: Record<string, Alert[]> = {}; for (const a of alerts) (m[a.pondId] ??= []).push(a); return m; }, [alerts]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [resetSignal, setResetSignal] = useState(0);
  const [zoomCommand, setZoomCommand] = useState<{ n: number; dir: 1 | -1 } | null>(null);
  const gl = useWebgl();
  const reduced = useReducedMotion();

  // The selection survives data refreshes, and is dropped only if that pond no longer exists.
  const selectedRow = selectedId ? byId.get(selectedId) ?? null : null;
  const hoveredRow = hoveredId ? byId.get(hoveredId) ?? null : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const select = useCallback((id: string) => setSelectedId(id), []);
  // Bring the details into view after a selection, moving the page only as far as needed.
  useEffect(() => { if (selectedId) panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }, [selectedId, reduced]);
  const hover = useCallback((id: string | null) => setHoveredId(id), []);

  // Tooltip: follows the pointer by writing its position straight to the DOM (no React state per mouse move), and stays inside the frame.
  const frame = useRef<HTMLDivElement>(null); const tip = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [touch, setTouch] = useState(false); const [inside, setInside] = useState(false);
  const place = useCallback(() => {
    const f = frame.current; const t = tip.current; const p = pointer.current; if (!f || !t || !p) return;
    const r = f.getBoundingClientRect(); const w = t.offsetWidth; const h = t.offsetHeight;
    const x = Math.min(Math.max(8, p.x - r.left + 16), Math.max(8, r.width - w - 8));
    const y = Math.min(Math.max(8, p.y - r.top + 16), Math.max(8, r.height - h - 8));
    t.style.transform = `translate(${x}px, ${y}px)`;
  }, []);
  const onPointerMove = (e: React.PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; setTouch(e.pointerType === 'touch'); setInside(true); place(); };
  const tooltipSnap: PondSnapshot | null = hoveredRow && inside && !touch ? snapshotOf(hoveredRow) : null;
  useEffect(() => { place(); }, [hoveredId, place]);

  const needsList = attention > 0;
  const dimHealthy = filter === 'attention' && needsList;
  const selectedSnap = selectedRow ? snapshotOf(selectedRow) : null;
  const useFallback = gl === 'none';
  const summaryLabel = `Farm plan with ${assignment.shown} ponds: ${stats.healthy} healthy, ${stats.warning} need attention, ${stats.critical} critical, ${stats.stale + stats.noData + stats.failed} without a recent reading.`;

  return (
    <section aria-labelledby="twin-title" className="rounded-xl border border-line bg-card" data-testid="farm-twin">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id="twin-title" className="text-lg font-medium tracking-tight text-ink">Farm view</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{assignment.shown} {assignment.shown === 1 ? 'pond' : 'ponds'} on a simplified plan of the farm (not to scale) · updated {formatDateTime(loadedAt)}</p>
        </div>
        <Segmented<Filter> label="Which ponds to emphasise" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All ponds' }, { value: 'attention', label: `Needs attention (${attention})` }]} />
      </div>
      <ul className="flex flex-wrap gap-2 px-5 pt-3 text-sm" aria-label="Pond counts">
        {([['healthy', stats.healthy, 'Healthy'], ['warning', stats.warning, 'Attention needed'], ['critical', stats.critical, 'Critical'], ['unknown', stats.stale + stats.noData + stats.failed, 'No recent reading']] as const).map(([tone, n, label]) => (
          <li key={tone} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1"><span className={cx('size-2 rounded-full', SWATCH[tone])} aria-hidden="true" /><span className="tabular-nums font-medium text-ink">{n}</span><span className="text-ink-soft">{label}</span></li>
        ))}
      </ul>
      <div className="space-y-2 px-5 pt-3">
        {demo ? <Notice tone="warning"><strong className="font-medium">Demo fixtures.</strong> These 17 ponds and their readings are made up to show every look of the farm view. They are not real ponds and are never saved. <Link href="/" className="underline">Back to real data</Link></Notice> : null}
        {assignment.shown < FARM_POND_COUNT && !demo ? <Notice>This database has {assignment.shown} {assignment.shown === 1 ? 'pond' : 'ponds'}, so {FARM_POND_COUNT - assignment.shown} places on the plan are empty. Add <code className="font-mono text-xs">?twin=demo</code> to the address to see the farm with 17 clearly labelled demo ponds.</Notice> : null}
        {assignment.hidden > 0 ? <Notice tone="warning">The plan has {FARM_POND_COUNT} places, so {assignment.hidden} more {assignment.hidden === 1 ? 'pond is' : 'ponds are'} not drawn. See every pond on the Ponds page.</Notice> : null}
        {useFallback ? <Notice>The 3D view is not available in this browser, so the flat plan is shown. Everything else works the same.</Notice> : null}
      </div>

      <div className="space-y-5 p-5">
        <div className="min-w-0 space-y-3">
          <div
            ref={frame} role="img" aria-label={summaryLabel}
            className={cx('relative h-[430px] overflow-hidden rounded-lg border border-line bg-surface sm:h-[420px] lg:h-[500px] xl:h-[560px]', hoveredId && 'cursor-pointer')}
            onPointerMove={onPointerMove} onPointerLeave={() => { setInside(false); hover(null); }}
          >
            {gl === 'checking' ? <SceneSkeleton />
              : useFallback ? <FarmFallback ponds={scenePonds} names={names} hoveredId={hoveredId} selectedId={selectedId} dimHealthy={dimHealthy} onHover={hover} onSelect={select} />
              : (
                <SceneBoundary fallback={(retry) => (
                  <div className="relative h-full w-full"><FarmFallback ponds={scenePonds} names={names} hoveredId={hoveredId} selectedId={selectedId} dimHealthy={dimHealthy} onHover={hover} onSelect={select} />
                    <div className="absolute left-3 top-3 max-w-xs rounded-lg bg-card/95 p-3 text-xs shadow-sm" role="alert">The 3D view stopped working, so the flat plan is shown. <button type="button" className="underline" onClick={retry}>Try 3D again</button></div></div>
                )}>
                  <FarmScene ponds={scenePonds} hoveredId={hoveredId} selectedId={selectedId} dimHealthy={dimHealthy} reducedMotion={reduced} resetSignal={resetSignal} zoomCommand={zoomCommand} onHover={hover} onSelect={select} labelRefs={labelRefs} />
                </SceneBoundary>
              )}
            {gl === 'ok' ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                {scenePonds.map((p) => (
                  <div key={p.id} ref={(el) => { if (el) labelRefs.current.set(p.id, el); else labelRefs.current.delete(p.id); }} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
                    <div className="-translate-x-1/2 -translate-y-full pb-1.5"><PondBadge label={p.label} tone={p.tone} empty={p.empty} selected={selectedId === p.id} dim={dimHealthy && !p.attention && !p.empty} /></div>
                  </div>
                ))}
              </div>
            ) : null}
            {gl === 'ok' ? (
              <div className="absolute right-3 top-3 flex flex-col gap-1.5" role="group" aria-label="Camera controls">
                <Button size="sm" variant="secondary" aria-label="Reset view to show the whole farm" title="Reset view" onClick={() => setResetSignal((n) => n + 1)}><ArrowCounterClockwise size={16} aria-hidden="true" /></Button>
                <Button size="sm" variant="secondary" aria-label="Zoom in" title="Zoom in" onClick={() => setZoomCommand((c) => ({ n: (c?.n ?? 0) + 1, dir: 1 }))}><MagnifyingGlassPlus size={16} aria-hidden="true" /></Button>
                <Button size="sm" variant="secondary" aria-label="Zoom out" title="Zoom out" onClick={() => setZoomCommand((c) => ({ n: (c?.n ?? 0) + 1, dir: -1 }))}><MagnifyingGlassMinus size={16} aria-hidden="true" /></Button>
              </div>
            ) : null}
            {gl === 'ok' ? <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-lg bg-card/90 px-2.5 py-1.5 text-xs text-ink-soft shadow-sm sm:block">Hold Ctrl/⌘ and scroll to zoom</p> : null}
            <ul className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-card/90 px-3 py-2 text-xs text-ink-soft shadow-sm" aria-label="Status legend">
              {LEGEND.map((l) => <li key={l.tone} className="flex items-center gap-1.5"><span className={cx('flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white', SWATCH[l.tone])} aria-hidden="true">{l.mark}</span>{l.label}</li>)}
            </ul>
            {tooltipSnap ? <div ref={tip} className="pointer-events-none absolute left-0 top-0 z-20"><PondTooltip snap={tooltipSnap} demo={demo} /></div> : null}
          </div>

          <ul className="flex flex-wrap gap-1.5" aria-label="All ponds">
            {assignment.slots.map((r, i) => r ? (
              <li key={r.pond.id}>
                <button
                  type="button" aria-pressed={selectedId === r.pond.id} aria-label={`${r.pond.name}, ${POND_STATUS[r.risk].label}`}
                  onClick={() => select(r.pond.id)} onFocus={() => hover(r.pond.id)} onBlur={() => hover(null)} onMouseEnter={() => hover(r.pond.id)} onMouseLeave={() => hover(null)}
                  className={cx('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors', selectedId === r.pond.id ? 'border-ink bg-surface text-ink' : 'border-line bg-card text-ink-soft hover:bg-surface hover:text-ink', dimHealthy && !needsAttention(r.risk) && 'opacity-50')}
                >
                  <span className={cx('size-2 rounded-full', SWATCH[toneOf(r.risk)])} aria-hidden="true" />
                  <span>{r.pond.name}</span>
                </button>
              </li>
            ) : null)}
          </ul>
        </div>

        <div ref={panelRef} className="min-w-0 scroll-mt-20">
          {selectedSnap && selectedRow ? (
            <PondPanel key={selectedSnap.id} snap={selectedSnap} alerts={alertsByPond[selectedSnap.id] ?? []} readings={selectedRow.summary?.parameters ?? {}} demo={demo} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center text-sm text-ink-soft"><p className="font-medium text-ink">No pond selected</p><p className="mt-1">Click a pond on the plan, or choose one from the list, to see its readings, problems and forecast here.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}
