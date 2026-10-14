// Digital Twin: the farm's fixed SCHEMATIC master plan, plus the pure helpers the 3D scene, the 2D fallback and the tests share.
// Positions are design coordinates (roughly metres), NOT surveyed locations. The plan is modelled on the planned layout of a
// lined-pond shrimp farm: ponds in blocks on a grid, service lanes, bridges between platforms, pump houses at lane junctions,
// round tanks, a canal along the back, and a boundary fence. Nothing here depends on data except which pond sits in which slot.
import type { FleetRow } from './fleet';
import type { RiskStatus } from './api/schemas';

export const FARM_POND_COUNT = 17;
export const POND = 15;          // pond footprint (square, rounded corners)
export const GAP = 3.2;          // lane between neighbouring ponds
export const CENTRAL = 7;        // wider central service lane on the main platform
export const MARGIN = 3.2;        // platform edge to nearest pond
export const CORNER = 2.8;       // pond corner radius
export const BRIDGE = 10;        // length of the road between platforms
export const TALL = 7;           // tallest structure (tank roofs), for camera fitting

export interface Rect { x: number; z: number; w: number; d: number }
export interface PondSlot { slot: number; x: number; z: number; block: 'A' | 'B' | 'C'; size: number }
export interface Building extends Rect { h: number; kind: 'blue' | 'brown' | 'white' }
export interface Tree { x: number; z: number; r: number; shade: number }
export interface Layout {
  ponds: PondSlot[];
  platforms: Rect[];
  bridges: Rect[];
  /** Ring roads around the platforms, drawn on the grass. */
  roads: Rect[];
  /** Water pipes laid along the lanes between ponds. */
  pipes: Rect[];
  canal: Rect;
  /** The farm island (grass), enclosed by the perimeter wall. Open water surrounds it. */
  ground: Rect;
  tanks: { x: number; z: number; r: number }[];
  houses: { x: number; z: number; rot: number }[];
  buildings: Building[];
  trees: Tree[];
  bounds: Rect;
  center: { x: number; z: number };
}

const colX = (x0: number, c: number) => x0 + MARGIN + c * (POND + GAP) + POND / 2;
const rowZ = (z0: number, r: number, central: boolean) => z0 + MARGIN + r * (POND + GAP) + POND / 2 + (central && r >= 2 ? CENTRAL - GAP : 0);
const expand = (r: Rect, m: number): Rect => ({ x: r.x - m, z: r.z - m, w: r.w + 2 * m, d: r.d + 2 * m });
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

/** Small deterministic random numbers, so the scenery is identical on every load. */
function mulberry32(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const ROAD_OFFSET = 3; export const ROAD_WIDTH = 2.4;
/** Four road strips around a rectangle, ROAD_OFFSET away from it. */
const ring = (r: Rect): Rect[] => {
  const o = ROAD_OFFSET; const w = ROAD_WIDTH; const x0 = r.x - o - w; const x1 = r.x + r.w + o; const z0 = r.z - o - w; const z1 = r.z + r.d + o;
  return [{ x: x0, z: z0, w: x1 + w - x0, d: w }, { x: x0, z: z1, w: x1 + w - x0, d: w }, { x: x0, z: z0, w, d: z1 + w - z0 }, { x: x1, z: z0, w, d: z1 + w - z0 }];
};

function build(): Layout {
  const ponds: PondSlot[] = [];
  // Main platform: blocks A (rows 0-1) and B (rows 2-3), three ponds across, split by the central service lane.
  const mainW = 2 * MARGIN + 3 * POND + 2 * GAP;
  const mainD = 2 * MARGIN + 4 * POND + 2 * GAP + CENTRAL;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ponds.push({ slot: r * 3 + c, x: colX(0, c), z: rowZ(0, r, true), block: r < 2 ? 'A' : 'B', size: POND });
  // Second platform: block C, three ponds in the first row and two in the second (the sixth place holds a building).
  const x2 = mainW + BRIDGE;
  const secD = 2 * MARGIN + 2 * POND + GAP;
  for (let c = 0; c < 3; c++) ponds.push({ slot: 12 + c, x: colX(x2, c), z: rowZ(0, 0, false), block: 'C', size: POND });
  for (let c = 0; c < 2; c++) ponds.push({ slot: 15 + c, x: colX(x2, c), z: rowZ(0, 1, false), block: 'C', size: POND });
  // Utility platform below block C: round tanks, the long store and a blue-roofed plant building.
  const utilZ = secD + 10;
  const utilD = mainD - utilZ;
  const platforms: Rect[] = [{ x: 0, z: 0, w: mainW, d: mainD }, { x: x2, z: 0, w: mainW, d: secD }, { x: x2, z: utilZ, w: mainW, d: utilD }];
  const bridges: Rect[] = [{ x: mainW - 0.5, z: 17, w: BRIDGE + 1, d: 6 }, { x: x2 + mainW / 2 - 3, z: secD - 0.5, w: 6, d: 10 + 1 }, { x: mainW - 0.5, z: utilZ + utilD / 2 - 3, w: BRIDGE + 1, d: 6 }];
  const gapX = (c: number) => MARGIN + (c + 1) * POND + c * GAP + GAP / 2;
  const centralZ = MARGIN + 2 * POND + GAP + CENTRAL / 2;
  const lowerGapZ = MARGIN + 3 * (POND + GAP) + CENTRAL - GAP * 1.5;                         // between rows 2 and 3, below the central lane
  const upperGapZ = MARGIN + POND + GAP / 2;
  const secGapZ = MARGIN + POND + GAP / 2;
  const houses = [
    { x: gapX(0), z: centralZ, rot: 0 }, { x: gapX(1), z: centralZ, rot: 0 }, { x: gapX(0), z: upperGapZ, rot: 0 }, { x: gapX(1), z: lowerGapZ, rot: 0 },
    { x: x2 + gapX(0), z: secGapZ, rot: 0 }, { x: x2 + gapX(1), z: secGapZ, rot: 0 },
  ];
  const pipe = (x: number, z: number, w: number, d: number): Rect => ({ x: x - w / 2, z: z - d / 2, w, d });
  const pipes: Rect[] = [
    ...[upperGapZ, centralZ, lowerGapZ].map((z) => pipe(mainW / 2, z, mainW - 2 * MARGIN, 0.5)),
    ...[0, 1].map((c) => pipe(gapX(c), mainD / 2, 0.5, mainD - 2 * MARGIN)),
    pipe(x2 + mainW / 2, secGapZ, mainW - 2 * MARGIN, 0.5), ...[0, 1].map((c) => pipe(x2 + gapX(c), secD / 2, 0.5, secD - 2 * MARGIN)),
  ];
  const tanks = [{ x: x2 + 14, z: utilZ + utilD - 12, r: 7 }, { x: x2 + 36, z: utilZ + utilD - 12, r: 7 }];
  const buildings: Building[] = [
    { x: x2 + 8, z: utilZ + 3.5, w: 30, d: 6, h: 2.8, kind: 'brown' },                                        // long store
    { x: x2 + 44, z: utilZ + utilD - 17, w: 11, d: 8, h: 3.6, kind: 'blue' },                                // plant building
    { x: colX(x2, 2) - 5, z: rowZ(0, 1, false) - 4, w: 10, d: 8, h: 3.2, kind: 'white' },                    // block C's sixth place
  ];
  // Island: platforms plus a verge, ring roads, a strip of trees, the canal and the perimeter wall.
  const ground: Rect = { x: -11, z: -19, w: x2 + mainW + 22, d: mainD + 11 + 19 };
  const canal: Rect = { x: ground.x + 2.5, z: -16, w: ground.w - 5, d: 7 };
  const roads = [...ring(platforms[0]!), ...ring({ x: x2, z: 0, w: mainW, d: mainD })];

  // Trees: seeded scatter, kept off platforms, roads, bridges, the canal, buildings and tanks, and spaced apart.
  const keepOut: Rect[] = [
    ...platforms.map((p) => expand(p, 2)), ...roads.map((r) => expand(r, 0.6)), ...bridges.map((b) => expand(b, 3)), expand(canal, 1.5),
    ...buildings.map((b) => expand(b, 2.5)), ...tanks.map((t) => ({ x: t.x - t.r - 2.5, z: t.z - t.r - 2.5, w: 2 * t.r + 5, d: 2 * t.r + 5 })), ...houses.map((h) => ({ x: h.x - 3, z: h.z - 3, w: 6, d: 6 })),
    { x: x2 - 9, z: ground.z + 8, w: 18 - BRIDGE + BRIDGE, d: ground.d - 16 },                                      // the open corridor between the two sites
  ];
  const rand = mulberry32(20261012);
  const trees: Tree[] = [];
  for (let n = 0; n < 60000 && trees.length < 480; n++) {
    const x = ground.x + 3 + rand() * (ground.w - 6); const z = ground.z + 3 + rand() * (ground.d - 6); const r = 0.9 + rand() * 1.3; const shade = rand();
    const box: Rect = { x: x - r, z: z - r, w: 2 * r, d: 2 * r };
    if (keepOut.some((k) => hit(k, box))) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r + r) * 0.9)) continue;
    trees.push({ x, z, r, shade });
  }
  const bounds = expand(ground, 3);
  return { ponds, platforms, bridges, roads, pipes, canal, ground, tanks, houses, buildings, trees, bounds, center: { x: ground.x + ground.w / 2, z: ground.z + ground.d / 2 } };
}
/** The one layout. Built once; identical on every load, in every session, on every screen. */
export const FARM: Layout = build();

export type Tone = 'healthy' | 'warning' | 'critical' | 'unknown';
export const TONE_COLOR: Record<Tone, string> = { healthy: '#52734b', warning: '#a66d25', critical: '#b64d43', unknown: '#77796f' };
/** Brighter rim colours for the lit pond edge in the 3D scene (the UI keeps the dashboard's muted status colours). */
export const RIM_COLOR: Record<Tone, string> = { healthy: '#4fd39b', warning: '#f3c13a', critical: '#e5493f', unknown: '#a7aeb2' };
/** Pond status for the scene. It is the backend's own pond status; no data (or old data, or a failed load) is "unknown", never healthy. */
export const toneOf = (risk: RiskStatus | 'ERROR'): Tone => (risk === 'NORMAL' ? 'healthy' : risk === 'WARNING' ? 'warning' : risk === 'CRITICAL' ? 'critical' : 'unknown');
export const needsAttention = (risk: RiskStatus | 'ERROR') => risk === 'WARNING' || risk === 'CRITICAL';

export interface SlotAssignment { slots: (FleetRow | null)[]; shown: number; total: number; hidden: number }
/**
 * Puts each real pond in a fixed slot. Order is by source identifier (falling back to name, then id), so a pond keeps its place
 * for as long as the set of ponds does not change. Empty slots stay empty; ponds beyond 17 are counted, never silently dropped.
 */
export function assignSlots(rows: FleetRow[], capacity = FARM_POND_COUNT): SlotAssignment {
  const key = (r: FleetRow) => `${r.pond.sourceId ?? r.pond.name}\u0000${r.pond.id}`;
  const sorted = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const slots: (FleetRow | null)[] = Array.from({ length: capacity }, (_, i) => sorted[i] ?? null);
  return { slots, shown: Math.min(sorted.length, capacity), total: sorted.length, hidden: Math.max(0, sorted.length - capacity) };
}

export const CAMERA = { azimuth: (14 * Math.PI) / 180, polar: (42 * Math.PI) / 180, distance: 400 } as const;

/** Camera angles for a viewport. The farm is landscape, so in a portrait frame the camera turns a quarter turn to put its long side along the tall axis. */
export function viewFor(width: number, height: number): { azimuth: number; polar: number } {
  return { azimuth: width / Math.max(height, 1) < 0.95 ? CAMERA.azimuth + Math.PI / 2 : CAMERA.azimuth, polar: CAMERA.polar };
}

export function cameraOffset(azimuth: number = CAMERA.azimuth, polar: number = CAMERA.polar, distance: number = CAMERA.distance): [number, number, number] {
  return [Math.sin(polar) * Math.sin(azimuth) * distance, Math.cos(polar) * distance, Math.sin(polar) * Math.cos(azimuth) * distance];
}

/**
 * Orthographic zoom (pixels per world unit) that frames the whole farm for a viewport: projects the 8 corners of the farm's bounding box
 * through the camera and fits their extents, so every pond is inside the frame at any aspect ratio.
 */
export function fitZoom(viewport: { w: number; h: number }, opts: { azimuth?: number; polar?: number; padding?: number; bounds?: Rect } = {}): number {
  const { azimuth = CAMERA.azimuth, polar = CAMERA.polar, padding = 0.05, bounds = FARM.bounds } = opts;
  const off = cameraOffset(azimuth, polar, 1);
  const f = off.map((v) => -v) as [number, number, number];                              // camera forward
  const right = norm([f[2], 0, -f[0]]);                                                  // forward x up(0,1,0), simplified
  const up = cross(right, f);
  const cx = bounds.x + bounds.w / 2; const cz = bounds.z + bounds.d / 2; const cy = TALL / 2;
  let mx = 0; let my = 0;
  for (const x of [bounds.x, bounds.x + bounds.w]) for (const z of [bounds.z, bounds.z + bounds.d]) for (const y of [0, TALL]) {
    const p: [number, number, number] = [x - cx, y - cy, z - cz];
    mx = Math.max(mx, Math.abs(dot(p, right))); my = Math.max(my, Math.abs(dot(p, up)));
  }
  return Math.min(viewport.w / (2 * mx), viewport.h / (2 * my)) * (1 - padding);
}
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
function norm(v: [number, number, number]): [number, number, number] { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/** Short label drawn on the pond: its place in the farm, "01" to "17". Names and IDs live in the tooltip and panel. */
export const slotLabel = (slot: number) => String(slot + 1).padStart(2, '0');

export interface PondSnapshot {
  id: string; name: string; sourceId?: string; risk: RiskStatus | 'ERROR'; tone: Tone;
  readings: { parameter: 'dissolved_oxygen' | 'ph' | 'temperature'; value: number; unit: string; risk: RiskStatus; recordedAt: string; ageMinutes: number | null }[];
  latestAt: string | null; latestAgeMinutes: number | null;
  /** Unresolved problems measured now (observed alerts), kept apart from forecast warnings. */
  problems: { id: string; parameter: string; severity: 'WARNING' | 'CRITICAL'; direction?: 'low' | 'high'; status: string }[];
  forecastWarnings: number;
}
const FACTORS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
/** Everything the tooltip, panel and fallback show about a pond, taken straight from the API's pond summary. Nothing is computed or defaulted. */
export function snapshotOf(row: FleetRow): PondSnapshot {
  const s = row.summary;
  return {
    id: row.pond.id, name: row.pond.name, sourceId: row.pond.sourceId, risk: row.risk, tone: toneOf(row.risk),
    readings: FACTORS.flatMap((p) => { const r = s?.parameters[p]; return r ? [{ parameter: p, value: r.value, unit: r.unit, risk: r.risk, recordedAt: r.recordedAt, ageMinutes: r.ageMinutes }] : []; }),
    latestAt: row.latestAt, latestAgeMinutes: row.latestAgeMinutes,
    problems: (s?.openAlertItems ?? []).filter((a) => a.origin === 'observed').map((a) => ({ id: a.id, parameter: a.parameter, severity: a.severity, direction: a.direction, status: a.status })),
    forecastWarnings: (s?.openAlertItems ?? []).filter((a) => a.origin === 'predicted').length,
  };
}
