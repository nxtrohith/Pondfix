import { ArrowRight, Binoculars } from '@phosphor-icons/react/dist/ssr';
import type { DownstreamRisk } from '@/lib/api/schemas';
import { PARAM_LABEL } from '@/lib/format';

const label = (p: string) => PARAM_LABEL[p] ?? p;
export const leadText = ([min, max]: [number, number]) => (max <= 1 ? 'within an hour' : min === 0 ? `within ${max} h` : min === max ? `in about ${min} h` : `in about ${min}–${max} h`);

/**
 * Rule-of-thumb "if this, then watch that" items. They are watch-outs, not measurements, forecasts or alerts: nothing here changes a
 * pond's status. Shared by the pond page and the alert advisory.
 */
export function DownstreamRiskList({ risks, compact = false }: { risks: DownstreamRisk[]; compact?: boolean }) {
  return (
    <ul className={compact ? 'mt-1.5 space-y-2' : 'space-y-3'}>
      {risks.map((r) => (
        <li key={r.id} className={compact ? 'rounded-md bg-card px-3 py-2' : 'rounded-xl border border-line bg-card px-4 py-3.5'}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink">
            {r.from !== r.affects ? <><span>{label(r.from)}</span><ArrowRight size={13} aria-hidden="true" className="text-ink-soft" /></> : null}<span>{label(r.affects)} {r.effect}</span>
            <span className="rounded-full bg-sage-pale px-2 py-0.5 text-[11px] font-normal text-olive-text">{leadText(r.leadHours)}</span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">{r.basis}</p>
          {r.precaution ? <p className="mt-1 text-[13px] text-ink"><span className="font-medium">What to do:</span> {r.precaution}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function DownstreamRisks({ risks }: { risks: DownstreamRisk[] }) {
  if (!risks.length) return <p className="flex items-center gap-2 text-[13px] text-ink-soft"><Binoculars size={16} aria-hidden="true" />Nothing to watch for right now. These checks use the latest readings and trends, so they can change within the hour.</p>;
  return <DownstreamRiskList risks={risks} />;
}
