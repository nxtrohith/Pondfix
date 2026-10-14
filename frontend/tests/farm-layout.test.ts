import { describe, expect, it } from 'vitest';
import { CAMERA, FARM, FARM_POND_COUNT, GAP, MARGIN, POND, TALL, assignSlots, cameraOffset, fitZoom, needsAttention, slotLabel, snapshotOf, toneOf, viewFor, type Rect } from '@/lib/farm';
import { demoFarm, DEMO_POND_COUNT } from '@/lib/farmDemo';
import { toRow } from '@/lib/fleet';
import type { PondSummary, RiskStatus } from '@/lib/api/schemas';

const inside = (px: number, pz: number, half: number, r: Rect, pad = 0) => px - half >= r.x + pad && px + half <= r.x + r.w - pad && pz - half >= r.z + pad && pz + half <= r.z + r.d - pad;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
const pondRect = (p: { x: number; z: number }): Rect => ({ x: p.x - POND / 2, z: p.z - POND / 2, w: POND, d: POND });

describe('the farm plan', () => {
  it('has exactly 17 ponds, with unique slots 0 to 16 and unique positions', () => {
    expect(FARM.ponds).toHaveLength(FARM_POND_COUNT);
    expect(FARM.ponds.map((p) => p.slot)).toEqual(Array.from({ length: 17 }, (_, i) => i));
    expect(new Set(FARM.ponds.map((p) => `${p.x},${p.z}`)).size).toBe(17);
    expect(FARM.ponds.filter((p) => p.block === 'A')).toHaveLength(6); expect(FARM.ponds.filter((p) => p.block === 'B')).toHaveLength(6); expect(FARM.ponds.filter((p) => p.block === 'C')).toHaveLength(5);
  });
  it('is fixed: the same on every load', async () => {
    const again = (await import('@/lib/farm')).FARM;
    expect(JSON.stringify(again)).toBe(JSON.stringify(FARM));
  });
  it('keeps ponds apart by at least a lane and never lets them touch', () => {
    for (let i = 0; i < 17; i++) for (let j = i + 1; j < 17; j++) {
      const a = FARM.ponds[i]!; const b = FARM.ponds[j]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThanOrEqual(POND + GAP - 1e-9);
    }
  });
  it('seats every pond fully on a platform, with a margin to the platform edge', () => {
    for (const p of FARM.ponds) expect(FARM.platforms.some((pl) => inside(p.x, p.z, POND / 2, pl, MARGIN - 1e-9)), `pond ${p.slot}`).toBe(true);
  });
  it('keeps roads, tanks, buildings and pump houses clear of every pond', () => {
    const ponds = FARM.ponds.map(pondRect);
    for (const b of FARM.bridges) for (const p of ponds) expect(overlaps(b, p)).toBe(false);
    for (const t of FARM.tanks) for (const p of ponds) expect(overlaps({ x: t.x - t.r, z: t.z - t.r, w: 2 * t.r, d: 2 * t.r }, p)).toBe(false);
    for (const h of FARM.houses) for (const p of ponds) expect(overlaps({ x: h.x - 1.4, z: h.z - 1.4, w: 2.8, d: 2.8 }, p)).toBe(false);
    for (const b of FARM.buildings) {
      expect(FARM.buildings.filter((o) => o !== b && overlaps(o, b))).toHaveLength(0);
      for (const t of FARM.tanks) expect(overlaps({ x: t.x - t.r, z: t.z - t.r, w: 2 * t.r, d: 2 * t.r }, b)).toBe(false);
      for (const h of FARM.houses) expect(overlaps({ x: h.x - 1.4, z: h.z - 1.4, w: 2.8, d: 2.8 }, b)).toBe(false);
    }
    // the building in block C's sixth place stays inside that place; the others sit on platforms
    expect(FARM.buildings.every((b) => FARM.platforms.some((pl) => b.x >= pl.x && b.z >= pl.z && b.x + b.w <= pl.x + pl.w && b.z + b.d <= pl.z + pl.d))).toBe(true);
  });
  it('lies entirely inside the ground, so nothing hangs in the air or outside the fence', () => {
    for (const r of [...FARM.platforms, ...FARM.bridges, ...FARM.roads, FARM.canal, ...FARM.buildings]) expect(inside(r.x + r.w / 2, r.z + r.d / 2, 0, FARM.ground) && r.x >= FARM.ground.x && r.z >= FARM.ground.z && r.x + r.w <= FARM.ground.x + FARM.ground.w && r.z + r.d <= FARM.ground.z + FARM.ground.d).toBe(true);
    expect(FARM.canal.z + FARM.canal.d).toBeLessThan(0);                       // canal is behind the platforms, not under them
  });
});

/** Projects the farm's bounding box like the real camera does, for checking fitZoom independently. */
function projected(viewport: { w: number; h: number }, view: { azimuth: number; polar: number }) {
  const zoom = fitZoom(viewport, view);
  const off = cameraOffset(view.azimuth, view.polar, 1);
  const f = off.map((v) => -v) as [number, number, number];
  const rl = Math.hypot(f[2], f[0]); const right: [number, number, number] = [f[2] / rl, 0, -f[0] / rl];
  const up: [number, number, number] = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const g = FARM.bounds; const c = [g.x + g.w / 2, TALL / 2, g.z + g.d / 2];
  let ex = 0; let ey = 0;
  for (const x of [g.x, g.x + g.w]) for (const z of [g.z, g.z + g.d]) for (const y of [0, TALL]) {
    const p = [x - c[0]!, y - c[1]!, z - c[2]!];
    ex = Math.max(ex, Math.abs(p[0]! * right[0] + p[1]! * right[1] + p[2]! * right[2]) * zoom); ey = Math.max(ey, Math.abs(p[0]! * up[0] + p[1]! * up[1] + p[2]! * up[2]) * zoom);
  }
  return { ex, ey, zoom };
}
describe('scenery', () => {
  it('has pipes only on platforms, and a road ring that never touches a pond or a building', () => {
    for (const pi of FARM.pipes) expect(FARM.platforms.some((pl) => pi.x >= pl.x && pi.z >= pl.z && pi.x + pi.w <= pl.x + pl.w && pi.z + pi.d <= pl.z + pl.d)).toBe(true);
    for (const r of FARM.roads) { for (const p of FARM.ponds) expect(overlaps(r, pondRect(p))).toBe(false); for (const b of FARM.buildings) expect(overlaps(r, b)).toBe(false); }
  });
  it('plants a fixed set of trees clear of ponds, platforms, roads, bridges, the canal, buildings, tanks and pump houses', () => {
    expect(FARM.trees.length).toBeGreaterThan(100);
    const obstacles: Rect[] = [...FARM.platforms, ...FARM.roads, ...FARM.bridges, FARM.canal, ...FARM.buildings, ...FARM.ponds.map(pondRect), ...FARM.tanks.map((t) => ({ x: t.x - t.r, z: t.z - t.r, w: 2 * t.r, d: 2 * t.r })), ...FARM.houses.map((h) => ({ x: h.x - 1.4, z: h.z - 1.4, w: 2.8, d: 2.8 }))];
    for (const t of FARM.trees) {
      const box: Rect = { x: t.x - t.r, z: t.z - t.r, w: 2 * t.r, d: 2 * t.r };
      expect(obstacles.some((o) => overlaps(o, box)), `tree at ${t.x.toFixed(1)},${t.z.toFixed(1)}`).toBe(false);
      expect(inside(t.x, t.z, t.r, FARM.ground)).toBe(true);
    }
  });
  it('is identical on every load', async () => { expect(JSON.stringify((await import('@/lib/farm')).FARM.trees)).toBe(JSON.stringify(FARM.trees)); });
});

describe('default camera framing', () => {
  it.each([[1440, 520], [1100, 480], [716, 400], [316, 430], [260, 600], [2000, 700]])('fits the whole farm in a %ix%i frame', (w, h) => {
    const { ex, ey } = projected({ w, h }, viewFor(w, h));
    expect(ex).toBeLessThanOrEqual(w / 2 + 0.5); expect(ey).toBeLessThanOrEqual(h / 2 + 0.5);
    expect(Math.max(ex / (w / 2), ey / (h / 2))).toBeGreaterThan(0.9);          // and it is not left tiny in the frame
  });
  it('turns the camera a quarter turn in a portrait frame, and keeps the default angle in a landscape one', () => {
    expect(viewFor(1200, 500).azimuth).toBeCloseTo(CAMERA.azimuth); expect(viewFor(390, 700).azimuth).toBeCloseTo(CAMERA.azimuth + Math.PI / 2);
    expect(viewFor(390, 700).polar).toBeCloseTo(CAMERA.polar);
  });
  it('uses a larger scale in a portrait frame when the camera is turned than it would unturned', () => {
    const turned = fitZoom({ w: 316, h: 430 }, viewFor(316, 430)); const unturned = fitZoom({ w: 316, h: 430 }, { azimuth: CAMERA.azimuth, polar: CAMERA.polar });
    expect(turned).toBeGreaterThan(unturned * 1.1);
  });
});

const summary = (risk: RiskStatus, extra: Partial<PondSummary> = {}): PondSummary => ({ pond: { id: 'p', name: 'p', status: 'active' }, riskStatus: risk, riskBasis: [], staleAfterMinutes: 60, parameters: {}, openAlerts: {}, latestPredictionGeneratedAt: null, ...extra });

describe('slot assignment', () => {
  const ponds = (n: number) => Array.from({ length: n }, (_, i) => toRow({ id: `id${i}`, name: `pond ${String(i).padStart(2, '0')}`, sourceId: `src${String(n - i).padStart(2, '0')}`, status: 'active' }, summary('NORMAL')));
  it('is stable: any input order gives the same slot for each pond', () => {
    const rows = ponds(17); const a = assignSlots(rows).slots.map((r) => r?.pond.id); const b = assignSlots([...rows].reverse()).slots.map((r) => r?.pond.id);
    expect(b).toEqual(a); expect(new Set(a).size).toBe(17);
  });
  it('leaves unused places empty and never invents a pond', () => {
    const r = assignSlots(ponds(15)); expect(r.slots.filter(Boolean)).toHaveLength(15); expect(r.slots.slice(15)).toEqual([null, null]); expect(r).toMatchObject({ shown: 15, total: 15, hidden: 0 });
  });
  it('reports ponds beyond 17 instead of silently dropping them', () => {
    const r = assignSlots(ponds(20)); expect(r.slots).toHaveLength(17); expect(r).toMatchObject({ shown: 17, total: 20, hidden: 3 });
  });
  it('labels places 01 to 17', () => { expect([0, 8, 16].map(slotLabel)).toEqual(['01', '09', '17']); });
});

describe('status shown on the farm', () => {
  it('is the backend status; missing, old or failed data is never healthy', () => {
    expect(toneOf('NORMAL')).toBe('healthy'); expect(toneOf('WARNING')).toBe('warning'); expect(toneOf('CRITICAL')).toBe('critical');
    for (const r of ['STALE', 'NO_DATA', 'UNKNOWN', 'ERROR'] as const) { expect(toneOf(r)).toBe('unknown'); expect(needsAttention(r)).toBe(false); }
    expect(needsAttention('WARNING') && needsAttention('CRITICAL')).toBe(true);
  });
  it('an acknowledged alert does not change the pond status (the backend status decides)', () => {
    const items = [{ id: 'a', origin: 'observed' as const, parameter: 'ph', severity: 'CRITICAL' as const, status: 'ACKNOWLEDGED', direction: 'high' as const }];
    const row = toRow({ id: 'p', name: 'p', status: 'active' }, summary('CRITICAL', { openAlertItems: items }));
    expect(toneOf(row.risk)).toBe('critical'); expect(snapshotOf(row).problems).toHaveLength(1);
  });
  it('keeps measured problems and forecast warnings apart', () => {
    const items = [{ id: 'a', origin: 'observed' as const, parameter: 'dissolved_oxygen', severity: 'WARNING' as const, status: 'ACTIVE' }, { id: 'b', origin: 'predicted' as const, parameter: 'ph', severity: 'WARNING' as const, status: 'ACTIVE' }];
    const s = snapshotOf(toRow({ id: 'p', name: 'p', status: 'active' }, summary('WARNING', { openAlertItems: items })));
    expect(s.problems.map((p) => p.parameter)).toEqual(['dissolved_oxygen']); expect(s.forecastWarnings).toBe(1);
  });
  it('only lists readings the API returned (no zeros, no defaults)', () => {
    const s = snapshotOf(toRow({ id: 'p', name: 'p', status: 'active' }, summary('NORMAL', { parameters: { ph: { value: 7.4, unit: 'pH', recordedAt: '2026-03-01T00:00:00Z', source: 'live', ageMinutes: 3, dataState: 'FRESH', risk: 'NORMAL' } } })));
    expect(s.readings.map((r) => r.parameter)).toEqual(['ph']);
  });
});

describe('demo fixtures', () => {
  const { rows, alerts } = demoFarm(Date.parse('2026-03-01T12:00:00Z'));
  it('are exactly 17, deterministic, and clearly named as demo', () => {
    expect(rows).toHaveLength(DEMO_POND_COUNT); expect(DEMO_POND_COUNT).toBe(17);
    expect(JSON.stringify(demoFarm(Date.parse('2026-03-01T12:00:00Z')))).toBe(JSON.stringify({ rows, alerts }));
    expect(rows.every((r) => r.pond.id.startsWith('demo-') && r.pond.name.startsWith('Demo pond'))).toBe(true);
    expect(alerts.every((a) => a.dataSource === 'simulated' && a.id.startsWith('demo-alert'))).toBe(true);
  });
  it('cover every look: healthy, warning, critical, old data and no data', () => {
    const c = (s: string) => rows.filter((r) => r.risk === s).length;
    expect([c('NORMAL'), c('WARNING'), c('CRITICAL'), c('STALE'), c('NO_DATA')]).toEqual([9, 3, 2, 2, 1]);
  });
  it('include dissolved-oxygen, pH and temperature problems, and a pond with two at once', () => {
    expect(new Set(alerts.map((a) => a.parameter))).toEqual(new Set(['dissolved_oxygen', 'ph', 'temperature']));
    const byPond = alerts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.pondId]: (m[a.pondId] ?? 0) + 1 }), {});
    expect(Math.max(...Object.values(byPond))).toBe(2);
  });
  it('mark old data as old and give no readings to the no-data pond', () => {
    const stale = rows.filter((r) => r.risk === 'STALE'); expect(stale.every((r) => Object.values(r.summary!.parameters).every((p) => p.risk === 'STALE' && p.ageMinutes === 360))).toBe(true);
    const none = rows.find((r) => r.risk === 'NO_DATA')!; expect(none.latestAt).toBeNull(); expect(Object.keys(none.summary!.parameters)).toHaveLength(0);
  });
});
