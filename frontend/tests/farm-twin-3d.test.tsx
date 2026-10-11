import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

// A WebGL-capable browser is simulated, and the real three.js scene is replaced by a probe that records exactly what the page hands it.
const scene = vi.hoisted(() => ({ last: null as null | Record<string, any>, renders: 0, boom: false }));
vi.mock('next/dynamic', async () => { const React = await import('react'); return { default: () => function MockScene(props: Record<string, any>) { if (scene.boom) throw new Error('webgl context lost'); scene.last = props; scene.renders++; return React.createElement('div', { 'data-testid': 'mock-scene' }); } }; });
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => ({ predictions: vi.fn().mockResolvedValue({ items: [], generatedAt: null }), acknowledgeAlert: vi.fn() }) }));
(globalThis as Record<string, unknown>).WebGLRenderingContext = function WebGLRenderingContext() {};
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;

import { FarmTwin } from '@/components/farm/FarmTwin';
import { FARM, slotLabel } from '@/lib/farm';
import { demoFarm } from '@/lib/farmDemo';

const NOW = Date.parse('2026-03-01T12:00:00Z'); const LOADED = '2026-03-01T12:00:00.000Z';
const props = () => scene.last as Record<string, any>;
const setup = () => { const { rows, alerts } = demoFarm(NOW); return render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />); };
beforeEach(() => { scene.last = null; scene.renders = 0; scene.boom = false; });
afterEach(() => vi.restoreAllMocks());

describe('farm view, 3D path', () => {
  it('hands the scene exactly 17 ponds in the fixed layout, with the backend status of each', () => {
    setup();
    const ponds = props().ponds as { id: string; slot: number; x: number; z: number; tone: string; label: string; attention: boolean; empty: boolean }[];
    expect(ponds).toHaveLength(17); expect(ponds.every((p) => !p.empty)).toBe(true);
    expect(ponds.map((p) => [p.x, p.z])).toEqual(FARM.ponds.map((p) => [p.x, p.z]));
    expect(ponds.map((p) => p.label)).toEqual(Array.from({ length: 17 }, (_, i) => slotLabel(i)));
    expect(ponds.map((p) => p.tone).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {})).toEqual({ healthy: 9, warning: 3, critical: 2, unknown: 3 });
    expect(ponds.filter((p) => p.attention).map((p) => p.label)).toEqual(['04', '06', '08', '11', '13']);
    expect(new Set(ponds.map((p) => p.id)).size).toBe(17);
  });
  it('draws a text tag for every pond over the scene, plus legend and camera controls', () => {
    setup();
    expect(screen.getByRole('list', { name: 'Status legend' })).toBeInTheDocument();
    for (const n of ['Reset view to show the whole farm', 'Zoom in', 'Zoom out']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Farm plan with 17 ponds: 9 healthy, 3 need attention, 2 critical, 3 without a recent reading/ })).toBeInTheDocument();
    expect(screen.queryByText(/3D view is not available/)).toBeNull();
  });
  it('hovering a pond in the scene shows that pond\'s card; selecting it opens the panel', () => {
    setup(); const id = (props().ponds as { id: string; label: string }[]).find((p) => p.label === '11')!.id;
    fireEvent.pointerMove(screen.getByRole('img', { name: /^Farm plan with/ }), { clientX: 50, clientY: 50, pointerType: 'mouse' });
    act(() => props().onHover(id)); expect(props().hoveredId).toBe(id); expect(screen.getByRole('status')).toHaveTextContent('Demo pond 11');
    act(() => props().onHover(null)); expect(screen.queryByRole('status')).toBeNull();
    act(() => props().onSelect(id)); expect(props().selectedId).toBe(id);
    expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 11' })).toBeInTheDocument();
  });
  it('Reset view and zoom send commands to the camera; a data refresh does NOT touch the camera', () => {
    const { rerender } = setup(); const before = props();
    expect(before.resetSignal).toBe(0); expect(before.zoomCommand).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); expect(props().zoomCommand).toEqual({ n: 1, dir: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' })); expect(props().zoomCommand).toEqual({ n: 2, dir: -1 });
    fireEvent.click(screen.getByRole('button', { name: /Reset view/ })); expect(props().resetSignal).toBe(1);
    const camera = { reset: props().resetSignal, zoom: props().zoomCommand };
    const { rows, alerts } = demoFarm(NOW + 60_000);
    rerender(<FarmTwin rows={rows.map((r, i) => (i === 0 ? { ...r, risk: 'CRITICAL' as const } : r))} alerts={alerts} mode="demo" loadedAt="2026-03-01T12:01:00.000Z" />);
    expect(props().ponds[0].tone).toBe('critical');                      // the new status arrived...
    expect({ reset: props().resetSignal, zoom: props().zoomCommand }).toEqual(camera);   // ...and the camera did not move
  });
  it('the attention filter dims healthy ponds in the scene and keeps all 17', () => {
    setup(); expect(props().dimHealthy).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ })); expect(props().dimHealthy).toBe(true); expect(props().ponds).toHaveLength(17);
  });
  it('passes the reduced-motion preference to the scene', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    setup(); expect(props().reducedMotion).toBe(true); vi.unstubAllGlobals();
    (globalThis as Record<string, unknown>).WebGLRenderingContext = function WebGLRenderingContext() {};
  });
  it('if the 3D scene crashes, the Overview stays up: a flat plan appears, with a way to retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    scene.boom = true; setup();
    expect(screen.getByRole('alert')).toHaveTextContent('The 3D view stopped working'); expect(within(screen.getByRole('group', { name: 'Farm plan, 2D view' })).getAllByRole('button')).toHaveLength(17);
    fireEvent.click(within(screen.getByRole('group', { name: 'Farm plan, 2D view' })).getByRole('button', { name: /Demo pond 06/ })); expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 06' })).toBeInTheDocument();
    scene.boom = false; fireEvent.click(screen.getByRole('button', { name: 'Try 3D again' })); expect(screen.getByTestId('mock-scene')).toBeInTheDocument();
  });
});
