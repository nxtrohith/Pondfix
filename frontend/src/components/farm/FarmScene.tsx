'use client';
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CORNER, FARM, POND, TALL, TONE_COLOR, cameraOffset, fitZoom, viewFor, type Tone } from '@/lib/farm';
export const LABEL_HEIGHT = 2.6;

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
  /** Overlay label elements by pond id. The scene writes their screen position every frame (no React state involved). */
  labelRefs: React.RefObject<Map<string, HTMLElement>>;
}

const LANE = '#b9bbb3'; const CURB = '#979a92'; const BANK = '#dcdfdd'; const GROUND = '#e8e4d5'; const WATER = '#559db1';
const AERATOR = '#f6f3ea';
const TOP = 0.6;                                   // platform surface height

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
const flat = (shape: THREE.Shape) => { const g = new THREE.ShapeGeometry(shape, 10); g.rotateX(-Math.PI / 2); return g; };

/** Shared geometry and materials: built once, used by every pond. */
function useAssets() {
  return useMemo(() => {
    const geo = {
      bank: extrude(roundedRect(POND, POND, CORNER, { w: POND - 3.2, d: POND - 3.2, r: CORNER - 1 }), 0.95),
      water: flat(roundedRect(POND - 3.0, POND - 3.0, CORNER - 0.9)),
      ring: extrude(roundedRect(POND + 1.5, POND + 1.5, CORNER + 0.7, { w: POND + 0.1, d: POND + 0.1, r: CORNER + 0.05 }), 0.22),
      ringThick: extrude(roundedRect(POND + 2.5, POND + 2.5, CORNER + 1.2, { w: POND + 0.1, d: POND + 0.1, r: CORNER + 0.05 }), 0.26),
      hover: extrude(roundedRect(POND + 3.1, POND + 3.1, CORNER + 1.5, { w: POND + 1.6, d: POND + 1.6, r: CORNER + 0.7 }), 0.2),
      selected: extrude(roundedRect(POND + 3.9, POND + 3.9, CORNER + 1.9, { w: POND + 2.6, d: POND + 2.6, r: CORNER + 1.2 }), 0.28),
      hit: new THREE.BoxGeometry(POND + 1.6, 0.4, POND + 1.6),
    };
    const water = (tone: Tone, dim: boolean) => {
      const base = new THREE.Color(WATER);
      if (tone === 'warning') base.lerp(new THREE.Color(TONE_COLOR.warning), 0.12);
      if (tone === 'critical') base.lerp(new THREE.Color(TONE_COLOR.critical), 0.16);
      if (tone === 'unknown') base.lerp(new THREE.Color('#9aa5a8'), 0.55);
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.28, metalness: 0.08, transparent: dim, opacity: dim ? 0.4 : 1 });
    };
    const ring = (tone: Tone, dim: boolean) => new THREE.MeshStandardMaterial({ color: TONE_COLOR[tone], emissive: TONE_COLOR[tone], emissiveIntensity: tone === 'critical' ? 0.45 : tone === 'warning' ? 0.25 : 0.1, roughness: 0.6, transparent: dim, opacity: dim ? 0.3 : 1 });
    const tones: Tone[] = ['healthy', 'warning', 'critical', 'unknown'];
    const mats = {
      water: Object.fromEntries(tones.flatMap((t) => [[`${t}`, water(t, false)], [`${t}-dim`, water(t, true)]])) as Record<string, THREE.MeshStandardMaterial>,
      ring: Object.fromEntries(tones.flatMap((t) => [[`${t}`, ring(t, false)], [`${t}-dim`, ring(t, true)]])) as Record<string, THREE.MeshStandardMaterial>,
      bank: new THREE.MeshStandardMaterial({ color: BANK, roughness: 0.85 }), bankDim: new THREE.MeshStandardMaterial({ color: BANK, roughness: 0.85, transparent: true, opacity: 0.45 }),
      pad: new THREE.MeshStandardMaterial({ color: '#cfd1ca', roughness: 0.95 }),
      hover: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 1 }),
      selected: new THREE.MeshStandardMaterial({ color: '#34372f', roughness: 0.8 }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      lane: new THREE.MeshStandardMaterial({ color: LANE, roughness: 0.95 }), curb: new THREE.MeshStandardMaterial({ color: CURB, roughness: 0.95 }),
      ground: new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1 }), fence: new THREE.MeshStandardMaterial({ color: '#b3b0a2', roughness: 0.9 }),
      canal: new THREE.MeshStandardMaterial({ color: '#6fa8b9', roughness: 0.3, metalness: 0.05 }), canalBank: new THREE.MeshStandardMaterial({ color: '#cbc6b6', roughness: 0.95 }),
      tank: new THREE.MeshStandardMaterial({ color: '#c9d3d7', roughness: 0.8 }), tankRoof: new THREE.MeshStandardMaterial({ color: '#eceff0', roughness: 0.7 }),
      house: new THREE.MeshStandardMaterial({ color: '#ebe7da', roughness: 0.9 }), houseRoof: new THREE.MeshStandardMaterial({ color: '#5f7480', roughness: 0.8 }),
      office: new THREE.MeshStandardMaterial({ color: '#efebe0', roughness: 0.9 }), officeRoof: new THREE.MeshStandardMaterial({ color: '#8c7b58', roughness: 0.85 }),
      aerator: new THREE.MeshStandardMaterial({ color: AERATOR, roughness: 0.6 }),
    };
    return { geo, mats };
  }, []);
}
type Assets = ReturnType<typeof useAssets>;

const Pond = memo(function Pond({ p, a, hovered, selected, dim, onHover, onSelect }: { p: ScenePond; a: Assets; hovered: boolean; selected: boolean; dim: boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void }) {
  const key = dim ? `${p.tone}-dim` : p.tone;
  const interactive = !p.empty;
  return (
    <group position={[p.x, 0, p.z]}>
      {!p.empty ? <mesh geometry={p.tone === 'critical' ? a.geo.ringThick : a.geo.ring} material={a.mats.ring[key]} position={[0, TOP, 0]} /> : null}
      {hovered ? <mesh geometry={a.geo.hover} material={a.mats.hover} position={[0, TOP, 0]} /> : null}
      {selected ? <mesh geometry={a.geo.selected} material={a.mats.selected} position={[0, TOP, 0]} /> : null}
      <mesh geometry={a.geo.bank} material={p.empty ? a.mats.pad : dim ? a.mats.bankDim : a.mats.bank} position={[0, TOP, 0]} />
      {!p.empty ? <mesh geometry={a.geo.water} material={a.mats.water[key]} position={[0, TOP + 0.5, 0]} /> : null}
      {interactive ? (
        <mesh
          geometry={a.geo.hit} material={a.mats.hit} position={[0, TOP + 1.2, 0]}
          onPointerOver={(e) => { e.stopPropagation(); onHover(p.id); }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}
        />
      ) : null}
    </group>
  );
});

function Aerators({ ponds, a }: { ponds: ScenePond[]; a: Assets }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const live = useMemo(() => ponds.filter((p) => !p.empty), [ponds]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const o = new THREE.Object3D(); let i = 0;
    for (const p of live) {
      for (const dx of [-4.2, -2.1, 0, 2.1, 4.2]) { o.position.set(p.x + dx, TOP + 1.2, p.z); o.rotation.set(0, 0, 0); o.updateMatrix(); m.setMatrixAt(i++, o.matrix); }
      for (const dz of [-4.2, -2.1, 2.1, 4.2]) { o.position.set(p.x, TOP + 1.2, p.z + dz); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix(); m.setMatrixAt(i++, o.matrix); }
    }
    m.count = i; m.instanceMatrix.needsUpdate = true;
  }, [live]);
  return <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, live.length * 9)]} material={a.mats.aerator}><boxGeometry args={[1.6, 0.34, 0.6]} /></instancedMesh>;
}

function Fence({ a }: { a: Assets }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const g = FARM.ground; const inset = 1.6;
  const x0 = g.x + inset; const x1 = g.x + g.w - inset; const z0 = g.z + inset; const z1 = g.z + g.d - inset;
  const posts = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = x0; x <= x1 + 0.01; x += 6) { out.push([x, z0], [x, z1]); }
    for (let z = z0 + 6; z < z1 - 0.01; z += 6) { out.push([x0, z], [x1, z]); }
    return out;
  }, [x0, x1, z0, z1]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D();
    posts.forEach(([x, z], i) => { o.position.set(x, 0.55, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true;
  }, [posts]);
  const rail = (key: string, cx: number, cz: number, w: number, d: number) => <mesh key={key} position={[cx, 0.85, cz]} material={a.mats.fence}><boxGeometry args={[w, 0.12, d]} /></mesh>;
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, posts.length]} material={a.mats.fence}><boxGeometry args={[0.3, 1.1, 0.3]} /></instancedMesh>
      {rail('n', (x0 + x1) / 2, z0, x1 - x0, 0.12)}{rail('s', (x0 + x1) / 2, z1, x1 - x0, 0.12)}{rail('w', x0, (z0 + z1) / 2, 0.12, z1 - z0)}{rail('e', x1, (z0 + z1) / 2, 0.12, z1 - z0)}
    </group>
  );
}

function Infrastructure({ a }: { a: Assets }) {
  const groundGeo = useMemo(() => extrude(roundedRect(FARM.ground.w, FARM.ground.d, 8), 0.8), []);
  const slab = (r: { x: number; z: number; w: number; d: number }, key: string) => (
    <group key={key}>
      <mesh material={a.mats.curb} position={[r.x + r.w / 2, 0.25, r.z + r.d / 2]}><boxGeometry args={[r.w + 1.4, 0.5, r.d + 1.4]} /></mesh>
      <mesh material={a.mats.lane} position={[r.x + r.w / 2, TOP / 2, r.z + r.d / 2]}><boxGeometry args={[r.w, TOP, r.d]} /></mesh>
    </group>
  );
  const c = FARM.canal;
  return (
    <group>
      <mesh geometry={groundGeo} material={a.mats.ground} position={[FARM.ground.x + FARM.ground.w / 2, -0.8, FARM.ground.z + FARM.ground.d / 2]} />
      <Fence a={a} />
      <mesh material={a.mats.canalBank} position={[c.x + c.w / 2, 0.2, c.z + c.d / 2]}><boxGeometry args={[c.w, 0.4, c.d]} /></mesh>
      <mesh material={a.mats.canal} position={[c.x + c.w / 2, 0.42, c.z + c.d / 2]}><boxGeometry args={[c.w - 1.2, 0.08, c.d - 2.4]} /></mesh>
      {FARM.platforms.map((r, i) => slab(r, `pl${i}`))}
      {FARM.bridges.map((r, i) => (<mesh key={`br${i}`} material={a.mats.lane} position={[r.x + r.w / 2, TOP / 2, r.z + r.d / 2]}><boxGeometry args={[r.w, TOP, r.d]} /></mesh>))}
      {FARM.tanks.map((t, i) => (
        <group key={`tk${i}`} position={[t.x, TOP, t.z]}>
          <mesh material={a.mats.tank} position={[0, 1.4, 0]}><cylinderGeometry args={[t.r, t.r, 2.8, 40]} /></mesh>
          <mesh material={a.mats.tankRoof} position={[0, 2.8 + 1.2, 0]}><coneGeometry args={[t.r * 1.03, 2.4, 40]} /></mesh>
        </group>
      ))}
      {FARM.houses.map((h, i) => (
        <group key={`hs${i}`} position={[h.x, TOP, h.z]}>
          <mesh material={a.mats.house} position={[0, 1.1, 0]}><boxGeometry args={[2.8, 2.2, 2.8]} /></mesh>
          <mesh material={a.mats.houseRoof} position={[0, 2.2 + 0.7, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[2.7, 1.4, 4]} /></mesh>
        </group>
      ))}
      <group position={[FARM.office.x + FARM.office.w / 2, TOP, FARM.office.z + FARM.office.d / 2]}>
        <mesh material={a.mats.office} position={[0, 1.2, 0]}><boxGeometry args={[FARM.office.w, 2.4, FARM.office.d]} /></mesh>
        <mesh material={a.mats.officeRoof} position={[0, 2.65, 0]}><boxGeometry args={[FARM.office.w + 1, 0.5, FARM.office.d + 1]} /></mesh>
      </group>
    </group>
  );
}

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

function pulseMaterials(mats: Assets['mats'], t: number) {
  mats.ring.critical!.emissiveIntensity = 0.5 + 0.35 * Math.sin((t * Math.PI * 2) / 2.6);
  mats.ring.warning!.emissiveIntensity = 0.28 + 0.14 * Math.sin((t * Math.PI * 2) / 3.6);
}
/** Slow pulse on warning and critical rims. Skipped entirely when the user prefers reduced motion. */
function Pulse({ a }: { a: Assets }) {
  useFrame(({ clock }) => pulseMaterials(a.mats, clock.elapsedTime));
  return null;
}

const _v = new THREE.Vector3();
/** Writes each pond tag's screen position straight to its DOM element after every rendered frame. */
function LabelProjector({ ponds, labelRefs }: { ponds: ScenePond[]; labelRefs: SceneProps['labelRefs'] }) {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => { invalidate(); }, [ponds, invalidate]);
  useFrame(({ camera, size }) => {
    for (const p of ponds) {
      const el = labelRefs.current.get(p.id); if (!el) continue;
      _v.set(p.x, TOP + LABEL_HEIGHT, p.z).project(camera);
      const k = Math.min(1.15, Math.max(0.62, (camera as THREE.OrthographicCamera).zoom / 3.4));   // smaller tags on small screens so neighbours never overlap
      el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) scale(${k.toFixed(2)})`;
      el.style.visibility = 'visible';
    }
  });
  return null;
}

function Scene({ ponds, hoveredId, selectedId, dimHealthy, reducedMotion, resetSignal, zoomCommand, onHover, onSelect, labelRefs }: SceneProps) {
  const a = useAssets();
  const attention = ponds.some((p) => p.attention);
  return (
    <>
      <hemisphereLight args={['#fffdf6', '#c9c5b4', 0.95]} />
      <directionalLight position={[-70, 140, 90]} intensity={1.5} />
      <directionalLight position={[80, 60, -60]} intensity={0.35} />
      <Infrastructure a={a} />
      <Aerators ponds={ponds} a={a} />
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
      orthographic dpr={[1, 2]} frameloop={animate ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      camera={{ zoom: 8, near: 1, far: 2000, position: [0, 200, 200] }}
      style={{ background: 'transparent' }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
