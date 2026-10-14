import { CORNER, FARM, POND, TONE_COLOR } from '@/lib/farm';
import type { ScenePond } from './FarmScene';

/**
 * Flat 2D plan of the same farm, drawn from the same layout and the same pond data as the 3D scene. It is shown when WebGL is not
 * available or the 3D view fails, and keeps every pond identifiable, coloured by status, selectable and keyboard-reachable.
 */
export function FarmFallback({ ponds, names, hoveredId, selectedId, dimHealthy, onHover, onSelect }: {
  ponds: ScenePond[]; names: Record<string, string>; hoveredId: string | null; selectedId: string | null; dimHealthy: boolean;
  onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const g = FARM.ground; const pad = 2;
  const R = (r: { x: number; z: number; w: number; d: number }, fill: string, extra: Record<string, number | string> = {}) => <rect x={r.x} y={r.z} width={r.w} height={r.d} fill={fill} {...extra} />;
  return (
    <svg viewBox={`${g.x - pad} ${g.z - pad} ${g.w + pad * 2} ${g.d + pad * 2}`} className="h-full w-full" role="group" aria-label="Farm plan, 2D view" preserveAspectRatio="xMidYMid meet">
      <rect x={g.x} y={g.z} width={g.w} height={g.d} rx={8} fill="#e8e4d5" />
      {R(FARM.canal, '#6fa8b9', { rx: 1.5 })}
      {FARM.platforms.map((p, i) => <g key={i}>{R({ x: p.x - 0.7, z: p.z - 0.7, w: p.w + 1.4, d: p.d + 1.4 }, '#979a92', { rx: 1.2 })}{R(p, '#b9bbb3')}</g>)}
      {FARM.bridges.map((b, i) => <g key={i}>{R(b, '#b9bbb3')}</g>)}
      {FARM.tanks.map((t, i) => <circle key={i} cx={t.x} cy={t.z} r={t.r} fill="#dde3e5" stroke="#b5bfc3" strokeWidth={0.5} />)}
      {FARM.houses.map((h, i) => <rect key={i} x={h.x - 1.4} y={h.z - 1.4} width={2.8} height={2.8} fill="#5f7480" />)}
      {R(FARM.office, '#efebe0', { stroke: '#8c7b58', strokeWidth: 0.6 })}
      {ponds.map((p) => {
        const dim = dimHealthy && !p.attention && !p.empty;
        const col = TONE_COLOR[p.tone]; const half = POND / 2;
        const label = p.empty ? p.label : `${names[p.id] ?? p.id}, ${p.tone === 'healthy' ? 'healthy' : p.tone === 'warning' ? 'attention needed' : p.tone === 'critical' ? 'critical' : 'no recent reading'}`;
        return (
          <g
            key={p.id} opacity={dim ? 0.4 : 1}
            {...(p.empty ? {} : {
              role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selectedId === p.id,
              onPointerEnter: () => onHover(p.id), onPointerLeave: () => onHover(null), onFocus: () => onHover(p.id), onBlur: () => onHover(null),
              onClick: () => onSelect(p.id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } },
              style: { cursor: 'pointer', outline: 'none' },
            })}
          >
            {!p.empty && selectedId === p.id ? <rect x={p.x - half - 1.5} y={p.z - half - 1.5} width={POND + 3} height={POND + 3} rx={CORNER + 1} fill="none" stroke="#34372f" strokeWidth={0.9} /> : null}
            {!p.empty && hoveredId === p.id ? <rect x={p.x - half - 1.2} y={p.z - half - 1.2} width={POND + 2.4} height={POND + 2.4} rx={CORNER + 1} fill="none" stroke="#ffffff" strokeWidth={1.2} /> : null}
            <rect x={p.x - half - 0.7} y={p.z - half - 0.7} width={POND + 1.4} height={POND + 1.4} rx={CORNER + 0.5} fill="none" stroke={p.empty ? 'transparent' : col} strokeWidth={p.tone === 'critical' ? 1.3 : 0.8} />
            <rect x={p.x - half} y={p.z - half} width={POND} height={POND} rx={CORNER} fill="#dcdfdd" />
            {!p.empty ? <rect x={p.x - half + 1.6} y={p.z - half + 1.6} width={POND - 3.2} height={POND - 3.2} rx={CORNER - 1} fill={p.tone === 'unknown' ? '#9fb0b5' : '#559db1'} /> : null}
            <g transform={`translate(${p.x} ${p.z})`}>
              <rect x={-3.6} y={-1.7} width={7.2} height={3.4} rx={1.7} fill="#fff" stroke={p.empty ? '#c9c7bb' : col} strokeWidth={0.35} />
              <text x={0} y={0.9} textAnchor="middle" fontSize={p.empty ? 1.5 : 2.2} fontWeight={600} fill="#34372f">{p.empty ? 'Unassigned' : `${p.tone === 'critical' ? '!! ' : p.tone === 'warning' ? '! ' : p.tone === 'unknown' ? '– ' : ''}${p.label}`}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
