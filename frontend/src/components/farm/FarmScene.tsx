'use client';
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CORNER, FARM, POND, RIM_COLOR, TALL, cameraOffset, fitZoom, viewFor, type Building, type Rect, type Tone } from '@/lib/farm';

export interface ScenePond { id: string; slot: number; x: number; z: number; tone: Tone; label: string; attention: boolean; empty: boolean }
export interface SceneProps {
  ponds: ScenePond[];
  hoveredId: string | null;
  selectedId: string | null;
  /** Fade ponds that are not warning/critical (the "Needs attention" filter). All ponds stay visible. */
  dimHealthy: boolean;
  reducedMotion: boolean;
  resetSignal: number;
  zoomCommand: { n: number; dir: 1 | -1 } | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Overlay tag elements by pond id. The scene writes their screen position every frame (no React state involved). */
  labelRefs: React.RefObject<Map<string, HTMLElement>>;
}
export const LABEL_HEIGHT = 0.5;
const TOP = 0.6;            // platform surface height
const WATER_Y = TOP + 0.5;  // pond water surface

// ---- geometry helpers ------------------------------------------------------------------------------------------------
function roundedRect(w: number, d: number, r: number, hole?: { w: number; d: number; r: number }) {
  const path = (s: THREE.Path | THREE.Shape, W: number, D: number, R: number) => {
    const x = -W / 2; const y = -D / 2;
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R); s.lineTo(x + W, y + D - R); s.quadraticCurveTo(x + W, y + D, x + W - R, y + D);
    s.lineTo(x + R, y + D); s.quadraticCurveTo(x, y + D, x, y + D - R); s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
  };
  const shape = new THREE.Shape(); path(shape, w, d, r);
  if (hole) { const h = new THREE.Path(); path(h, hole.w, hole.d, hole.r); shape.holes.push(h); }
  return shape;
}
const extrude = (shape: THREE.Shape, depth: number) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); return g; };
/** A flat shape whose texture coordinates span it exactly once (used for the water gradient). */
function flatTextured(shape: THREE.Shape, size: number) {
  const g = new THREE.ShapeGeometry(shape, 10);
  const pos = g.attributes.position!; const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / size + 0.5, pos.getY(i) / size + 0.5);
  g.rotateX(-Math.PI / 2); return g;
}
function gableRoof(span: number, length: number, rise: number) {
  const tri = new THREE.Shape(); tri.moveTo(-span / 2, 0); tri.lineTo(span / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const g = new THREE.ExtrudeGeometry(tri, { depth: length, bevelEnabled: false }); g.translate(0, 0, -length / 2); return g;
}
function seeded(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}

/** Shared geometry, textures and materials: built once, used by every pond. */
function useAssets() {
  return useMemo(() => {
    const rnd = seeded(7);
    const waterTex = canvasTexture(256, (c) => {
      const g = c.createRadialGradient(128, 128, 8, 128, 128, 150); g.addColorStop(0, '#22a3a9'); g.addColorStop(0.5, '#33bdb0'); g.addColorStop(1, '#6ddcc2'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      c.lineWidth = 1.6; for (let i = 0; i < 46; i++) { c.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.09})`; c.beginPath(); c.arc(rnd() * 256, rnd() * 256, 8 + rnd() * 40, rnd() * 6, rnd() * 6 + 0.9 + rnd()); c.stroke(); }
    });
    const grassTex = canvasTexture(1024, (c) => {
      c.fillStyle = '#86b95a'; c.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 1400; i++) { const r = 8 + rnd() * 34; c.fillStyle = rnd() > 0.5 ? `rgba(104,158,70,${0.16 + rnd() * 0.18})` : `rgba(160,203,106,${0.14 + rnd() * 0.16})`; c.beginPath(); c.arc(rnd() * 1024, rnd() * 1024, r, 0, 7); c.fill(); }
    });
    const seaTex = canvasTexture(512, (c) => {
      c.fillStyle = '#64b3c9'; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 320; i++) { c.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.04 + rnd() * 0.07})` : `rgba(30,100,130,${0.05 + rnd() * 0.07})`; c.beginPath(); c.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 3 + rnd() * 9, rnd() * 0.5 - 0.25, 0, 7); c.fill(); }
    }, true);
    seaTex.repeat.set(10, 10);
    const geo = {
      bank: extrude(roundedRect(POND, POND, CORNER, { w: POND - 3.2, d: POND - 3.2, r: CORNER - 1 }), 0.95),
      water: flatTextured(roundedRect(POND - 3.0, POND - 3.0, CORNER - 0.9), POND - 3.0),
      rim: extrude(roundedRect(POND - 3.2, POND - 3.2, CORNER - 1, { w: POND - 5.2, d: POND - 5.2, r: Math.max(0.3, CORNER - 2.6) }), 0.1),
      rimThick: extrude(roundedRect(POND - 3.2, POND - 3.2, CORNER - 1, { w: POND - 6.2, d: POND - 6.2, r: 0.3 }), 0.1),
      hover: extrude(roundedRect(POND + 2.6, POND + 2.6, CORNER + 1.3, { w: POND + 0.2, d: POND + 0.2, r: CORNER + 0.1 }), 0.2),
      selected: extrude(roundedRect(POND + 3.6, POND + 3.6, CORNER + 1.8, { w: POND + 1.4, d: POND + 1.4, r: CORNER + 0.9 }), 0.26),
      dim: new THREE.ShapeGeometry(roundedRect(POND, POND, CORNER), 10).rotateX(-Math.PI / 2),
      hit: new THREE.BoxGeometry(POND + 1.6, 0.4, POND + 1.6),
      cone: new THREE.ConeGeometry(1.3, 2.4, 14, 1, true), spray: new THREE.RingGeometry(1.7, 3.3, 28).rotateX(-Math.PI / 2),
      foliage: new THREE.IcosahedronGeometry(1, 1),
    };
    const tint: Record<Tone, string> = { healthy: '#ffffff', warning: '#ffffff', critical: '#8a7480', unknown: '#a8b4b4' };
    const water = (t: Tone) => new THREE.MeshStandardMaterial({ map: waterTex, color: tint[t], emissive: '#0c8088', emissiveIntensity: 0.42, roughness: 0.18, metalness: 0.1 });
    const rim = (t: Tone) => new THREE.MeshStandardMaterial({ color: RIM_COLOR[t], emissive: RIM_COLOR[t], emissiveIntensity: t === 'critical' ? 0.7 : t === 'warning' ? 0.5 : 0.35, roughness: 0.5 });
    const tones: Tone[] = ['healthy', 'warning', 'critical', 'unknown'];
    const std = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
    const mats = {
      water: Object.fromEntries(tones.map((t) => [t, water(t)])) as Record<Tone, THREE.MeshStandardMaterial>,
      rim: Object.fromEntries(tones.map((t) => [t, rim(t)])) as Record<Tone, THREE.MeshStandardMaterial>,
      bank: std('#eceae0', 0.85), pad: std('#d3d1c6', 0.95), dim: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.62, depthWrite: false }),
      hover: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 1 }), selected: std('#34372f', 0.8),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      lane: std('#e2dfd2', 0.95), curb: std('#bdb9a9', 0.95), road: std('#d6d3c6', 0.95), pipe: std('#c6d4db', 0.5),
      grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), soil: std('#9d977f', 1), sea: new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35, metalness: 0.05 }),
      wall: std('#cfccbf', 0.95), wallCap: std('#e4e1d5', 0.9), canal: new THREE.MeshStandardMaterial({ color: '#5fb1c6', roughness: 0.25, metalness: 0.05 }), canalBank: std('#cfc9b6', 0.95),
      tank: std('#f0f1ee', 0.8), tankRoof: std('#f7f8f6', 0.7), houseBody: std('#7ba5d8', 0.8), houseRoof: std('#eef2f6', 0.8),
      spray: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), sprayRing: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }),
      foliage: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
    };
    const kinds = { blue: { wall: std('#ece9e0'), roof: std('#3f72b8', 0.8) }, brown: { wall: std('#e6dfd0'), roof: std('#8b6b46', 0.85) }, white: { wall: std('#f2f0ea'), roof: std('#8d969c', 0.85) } };
    return { geo, mats, kinds };
  }, []);
}
type Assets = ReturnType<typeof useAssets>;

// ---- ponds -------------------------------------------------------------------------------------------------------------
const Pond = memo(function Pond({ p, a, hovered, selected, dim, onHover, onSelect }: { p: ScenePond; a: Assets; hovered: boolean; selected: boolean; dim: boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void }) {
  return (
    <group position={[p.x, 0, p.z]}>
      {hovered ? <mesh geometry={a.geo.hover} material={a.mats.hover} position={[0, TOP, 0]} /> : null}
      {selected ? <mesh geometry={a.geo.selected} material={a.mats.selected} position={[0, TOP, 0]} /> : null}
      <mesh geometry={a.geo.bank} material={p.empty ? a.mats.pad : a.mats.bank} position={[0, TOP, 0]} castShadow receiveShadow />
      {!p.empty ? (
        <>
          <mesh geometry={a.geo.water} material={a.mats.water[p.tone]} position={[0, WATER_Y, 0]} receiveShadow />
          <mesh geometry={p.tone === 'critical' ? a.geo.rimThick : a.geo.rim} material={a.mats.rim[p.tone]} position={[0, WATER_Y + 0.03, 0]} />
          {dim ? <mesh geometry={a.geo.dim} material={a.mats.dim} position={[0, TOP + 1.1, 0]} renderOrder={5} /> : null}
          <mesh
            geometry={a.geo.hit} material={a.mats.hit} position={[0, TOP + 1.2, 0]}
            onPointerOver={(e) => { e.stopPropagation(); onHover(p.id); }} onPointerOut={() => onHover(null)} onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}
          />
        </>
      ) : null}
    </group>
  );
});

/** One aerator fountain per pond: a spray cone and a ripple ring, each in a single draw call. */
function Fountains({ ponds, a }: { ponds: ScenePond[]; a: Assets }) {
  const cones = useRef<THREE.InstancedMesh>(null); const rings = useRef<THREE.InstancedMesh>(null);
  const live = useMemo(() => ponds.filter((p) => !p.empty), [ponds]);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    live.forEach((p, i) => {
      o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      o.position.set(p.x, WATER_Y + 1.2, p.z); o.updateMatrix(); cones.current?.setMatrixAt(i, o.matrix);
      o.position.set(p.x, WATER_Y + 0.06, p.z); o.updateMatrix(); rings.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [cones.current, rings.current]) if (m) { m.count = live.length; m.instanceMatrix.needsUpdate = true; }
  }, [live]);
  const n = Math.max(1, live.length);
  return (<>
    <instancedMesh ref={cones} args={[a.geo.cone, a.mats.spray, n]} />
    <instancedMesh ref={rings} args={[a.geo.spray, a.mats.sprayRing, n]} />
  </>);
}

// ---- landscape ---------------------------------------------------------------------------------------------------------
function Trees({ a }: { a: Assets }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(); const col = new THREE.Color();
    FARM.trees.forEach((t, i) => {
      o.position.set(t.x, t.r * 0.95, t.z); o.scale.set(t.r, t.r * 1.15, t.r); o.rotation.set(0, t.shade * 6, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.setHSL(0.26 + t.shade * 0.07, 0.42 + t.shade * 0.18, 0.27 + t.shade * 0.16));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[a.geo.foliage, a.mats.foliage, FARM.trees.length]} castShadow receiveShadow />;
}

const box = (r: Rect, y: number, h: number, mat: THREE.Material, key: string, shadow = true) => (
  <mesh key={key} material={mat} position={[r.x + r.w / 2, y + h / 2, r.z + r.d / 2]} castShadow={shadow} receiveShadow><boxGeometry args={[r.w, h, r.d]} /></mesh>
);

function BuildingMesh({ b, a }: { b: Building; a: Assets }) {
  const k = a.kinds[b.kind]; const along = b.w >= b.d; const span = Math.min(b.w, b.d) + 0.9; const length = Math.max(b.w, b.d) + 0.9;
  const roof = useMemo(() => gableRoof(span, length, Math.min(span * 0.28, 2.2)), [span, length]);
  return (
    <group position={[b.x + b.w / 2, TOP, b.z + b.d / 2]}>
      <mesh material={k.wall} position={[0, b.h / 2, 0]} castShadow receiveShadow><boxGeometry args={[b.w, b.h, b.d]} /></mesh>
      <mesh geometry={roof} material={k.roof} position={[0, b.h, 0]} rotation={[0, along ? Math.PI / 2 : 0, 0]} castShadow />
    </group>
  );
}

function Landscape({ a }: { a: Assets }) {
  const g = FARM.ground; const c = FARM.canal; const inset = 1.3;
  const wallSeg = (key: string, r: Rect) => (<group key={key}>{box(r, 0, 1.4, a.mats.wall, key + 'b')}{box({ x: r.x - 0.1, z: r.z - 0.1, w: r.w + 0.2, d: r.d + 0.2 }, 1.4, 0.2, a.mats.wallCap, key + 'c', false)}</group>);
  const t = 0.8;
  return (
    <group>
      <mesh material={a.mats.sea} position={[FARM.center.x, -0.9, FARM.center.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1400, 1400]} /></mesh>
      <mesh material={a.mats.soil} position={[g.x + g.w / 2, -0.8, g.z + g.d / 2]}><boxGeometry args={[g.w, 1.6, g.d]} /></mesh>
      <mesh material={a.mats.grass} position={[g.x + g.w / 2, 0.001, g.z + g.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[g.w, g.d]} /></mesh>
      {wallSeg('wn', { x: g.x + inset, z: g.z + inset, w: g.w - 2 * inset, d: t })}{wallSeg('ws', { x: g.x + inset, z: g.z + g.d - inset - t, w: g.w - 2 * inset, d: t })}
      {wallSeg('ww', { x: g.x + inset, z: g.z + inset, w: t, d: g.d - 2 * inset })}{wallSeg('we', { x: g.x + g.w - inset - t, z: g.z + inset, w: t, d: g.d - 2 * inset })}
      {box(c, 0, 0.7, a.mats.canalBank, 'canalb')}
      <mesh material={a.mats.canal} position={[c.x + c.w / 2, 0.72, c.z + c.d / 2]}><boxGeometry args={[c.w - 1.2, 0.06, c.d - 2.2]} /></mesh>
      {FARM.roads.map((r, i) => box(r, 0, 0.14, a.mats.road, `rd${i}`, false))}
      {FARM.platforms.map((r, i) => (<group key={`pl${i}`}>{box({ x: r.x - 0.7, z: r.z - 0.7, w: r.w + 1.4, d: r.d + 1.4 }, 0, 0.5, a.mats.curb, `c${i}`, false)}{box(r, 0, TOP, a.mats.lane, `p${i}`)}</group>))}
      {FARM.bridges.map((r, i) => box(r, 0, TOP, a.mats.lane, `br${i}`, false))}
      {FARM.pipes.map((r, i) => box(r, TOP, 0.42, a.mats.pipe, `pp${i}`, false))}
      {FARM.tanks.map((tk, i) => (
        <group key={`tk${i}`} position={[tk.x, TOP, tk.z]}>
          <mesh material={a.mats.tank} position={[0, 1.7, 0]} castShadow receiveShadow><cylinderGeometry args={[tk.r, tk.r, 3.4, 48]} /></mesh>
          <mesh material={a.mats.tankRoof} position={[0, 3.4 + 0.8, 0]} castShadow><coneGeometry args={[tk.r * 1.02, 1.6, 48]} /></mesh>
        </group>
      ))}
      {FARM.houses.map((h, i) => (
        <group key={`hs${i}`} position={[h.x, TOP + 0.42, h.z]}>
          <mesh material={a.mats.houseBody} position={[0, 1.1, 0]} castShadow receiveShadow><boxGeometry args={[2.8, 2.2, 2.8]} /></mesh>
          <mesh material={a.mats.houseRoof} position={[0, 2.35, 0]} castShadow><boxGeometry args={[3.2, 0.3, 3.2]} /></mesh>
        </group>
      ))}
      {FARM.buildings.map((b, i) => <BuildingMesh key={`bd${i}`} b={b} a={a} />)}
      <Trees a={a} />
    </group>
  );
}

// ---- camera, light, pulse ----------------------------------------------------------------------------------------------
// Camera mutation lives in plain functions: three.js objects are mutable by design and are updated imperatively.
function applyView(cam: THREE.OrthographicCamera, fit: number, view: { azimuth: number; polar: number }, controls: { target: THREE.Vector3; update: () => void } | null) {
  const c = FARM.center; const off = cameraOffset(view.azimuth, view.polar);
  cam.position.set(c.x + off[0], TALL / 2 + off[1], c.z + off[2]);
  cam.near = 1; cam.far = 2000; cam.zoom = fit;
  cam.lookAt(c.x, TALL / 2, c.z); cam.updateProjectionMatrix();
  if (controls) { controls.target.set(c.x, TALL / 2, c.z); controls.update(); }
}
function applyZoom(cam: THREE.OrthographicCamera, fit: number, dir: 1 | -1) {
  cam.zoom = Math.min(fit * 3.2, Math.max(fit * 0.9, cam.zoom * (dir > 0 ? 1.3 : 1 / 1.3)));
  cam.updateProjectionMatrix();
}
/** Keeps the look-at point over the farm so the user cannot pan it out of view. */
function clampPan(cam: THREE.OrthographicCamera, target: THREE.Vector3) {
  const g = FARM.ground;
  const nx = Math.min(g.x + g.w, Math.max(g.x, target.x)); const nz = Math.min(g.z + g.d, Math.max(g.z, target.z));
  if (nx !== target.x || nz !== target.z) { cam.position.x += nx - target.x; cam.position.z += nz - target.z; target.x = nx; target.z = nz; }
}
function aimSun(light: THREE.DirectionalLight, target: THREE.Object3D) {
  const c = FARM.center; const g = FARM.ground; const reach = Math.max(g.w, g.d) * 0.62;
  target.position.set(c.x, 0, c.z); target.updateMatrixWorld(); light.target = target;
  light.position.set(c.x - 90, 150, c.z - 50);
  Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: 500 });
  light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -0.0004;
}
/** The scenery never moves, so shadows are rendered once (and once more after everything has mounted) instead of every frame. */
function bakeShadows(gl: THREE.WebGLRenderer) { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }

function Sun() {
  const ref = useRef<THREE.DirectionalLight>(null); const target = useMemo(() => new THREE.Object3D(), []);
  const gl = useThree((s) => s.gl); const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (ref.current) aimSun(ref.current, target);
    bakeShadows(gl); invalidate();
    const t = setTimeout(() => { bakeShadows(gl); invalidate(); }, 500);
    return () => clearTimeout(t);
  }, [gl, invalidate, target]);
  return (<>
    <primitive object={target} />
    <directionalLight ref={ref} color="#fff0d8" intensity={2.3} castShadow shadow-mapSize={[2048, 2048]} />
  </>);
}

/** Frames the farm, owns the camera limits, and answers the Reset / zoom buttons. It never touches the camera when data refreshes. */
function Rig({ resetSignal, zoomCommand }: { resetSignal: number; zoomCommand: SceneProps['zoomCommand'] }) {
  const camera = useThree((s) => s.camera); const size = useThree((s) => s.size); const controls = useThree((s) => s.controls); const invalidate = useThree((s) => s.invalidate);
  const view = useMemo(() => viewFor(size.width, size.height), [size.width, size.height]);
  const fit = useMemo(() => fitZoom({ w: Math.max(size.width, 1), h: Math.max(size.height, 1) }, view), [size.width, size.height, view]);
  useLayoutEffect(() => {
    applyView(camera as THREE.OrthographicCamera, fit, view, controls as unknown as { target: THREE.Vector3; update: () => void } | null);
    invalidate();
  }, [camera, fit, view, resetSignal, controls, invalidate]);
  const lastCmd = useRef(0);
  useLayoutEffect(() => {
    if (!zoomCommand || zoomCommand.n === lastCmd.current) return;
    lastCmd.current = zoomCommand.n;
    applyZoom(camera as THREE.OrthographicCamera, fit, zoomCommand.dir); invalidate();
  }, [zoomCommand, camera, fit, invalidate]);
  const onChange = useCallback(() => {
    const oc = controls as unknown as { target: THREE.Vector3 } | null;
    if (oc) clampPan(camera as THREE.OrthographicCamera, oc.target);
  }, [controls, camera]);
  return (
    <OrbitControls
      makeDefault enableDamping dampingFactor={0.14} screenSpacePanning rotateSpeed={0.5}
      minZoom={fit * 0.9} maxZoom={fit * 3.2}
      minPolarAngle={view.polar - 0.22} maxPolarAngle={view.polar + 0.22}
      minAzimuthAngle={view.azimuth - 0.55} maxAzimuthAngle={view.azimuth + 0.55}
      onChange={onChange}
    />
  );
}

const _v = new THREE.Vector3();
/** Writes each pond tag's screen position straight to its DOM element after every rendered frame. */
function LabelProjector({ ponds, labelRefs }: { ponds: ScenePond[]; labelRefs: SceneProps['labelRefs'] }) {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => { invalidate(); }, [ponds, invalidate]);
  useFrame(({ camera, size }) => {
    const k = Math.min(1.15, Math.max(0.62, (camera as THREE.OrthographicCamera).zoom / 3.4));   // smaller tags on small screens so neighbours never overlap
    for (const p of ponds) {
      const el = labelRefs.current.get(p.id); if (!el) continue;
      _v.set(p.x, WATER_Y + LABEL_HEIGHT, p.z).project(camera);
      el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) scale(${k.toFixed(2)})`;
      el.style.visibility = 'visible';
    }
  });
  return null;
}

function pulseMaterials(mats: Assets['mats'], t: number) {
  mats.rim.critical.emissiveIntensity = 0.75 + 0.45 * Math.sin((t * Math.PI * 2) / 2.6);
  mats.rim.warning.emissiveIntensity = 0.5 + 0.2 * Math.sin((t * Math.PI * 2) / 3.6);
}
/** Slow pulse on warning and critical rims. Skipped entirely when the user prefers reduced motion. */
function Pulse({ a }: { a: Assets }) {
  useFrame(({ clock }) => pulseMaterials(a.mats, clock.elapsedTime));
  return null;
}

function Scene({ ponds, hoveredId, selectedId, dimHealthy, reducedMotion, resetSignal, zoomCommand, onHover, onSelect, labelRefs }: SceneProps) {
  const a = useAssets();
  const attention = ponds.some((p) => p.attention);
  return (
    <>
      <hemisphereLight args={['#dfeeff', '#9bb36f', 0.95]} />
      <Sun />
      <Landscape a={a} />
      <Fountains ponds={ponds} a={a} />
      {ponds.map((p) => <Pond key={p.id} p={p} a={a} hovered={hoveredId === p.id} selected={selectedId === p.id} dim={dimHealthy && !p.attention && !p.empty} onHover={onHover} onSelect={onSelect} />)}
      {!reducedMotion && attention ? <Pulse a={a} /> : null}
      <Rig resetSignal={resetSignal} zoomCommand={zoomCommand} />
      <LabelProjector ponds={ponds} labelRefs={labelRefs} />
    </>
  );
}

export default function FarmScene(props: SceneProps) {
  const animate = !props.reducedMotion && props.ponds.some((p) => p.attention);
  return (
    <Canvas
      orthographic flat shadows="percentage" dpr={[1, 2]} frameloop={animate ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      camera={{ zoom: 8, near: 1, far: 2000, position: [0, 200, 200] }}
      style={{ background: 'transparent' }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
