import { RIM_COLOR, type Tone } from '@/lib/farm';
import { cx } from '../ui/cx';

/** A mark inside the coloured dot, so state is never carried by colour alone. */
const MARK: Record<Tone, string> = { healthy: '✓', warning: '!', critical: '!!', unknown: '–' };

/** The tag on each pond: a white pill with a status dot and the pond's place number, with a pointer to the pond. */
export function PondBadge({ label, tone, empty, selected, dim }: { label: string; tone: Tone; empty: boolean; selected: boolean; dim: boolean }) {
  if (empty) return <div className="select-none whitespace-nowrap rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-[#6a6c62]">{label}</div>;
  return (
    <div className={cx('relative flex select-none items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-1 text-[12px] font-semibold leading-none text-[#34372f] shadow-[0_2px_6px_rgba(30,40,30,0.28)]', selected && 'ring-2 ring-[#34372f]', dim && 'opacity-50')}>
      <span className="grid size-[15px] place-items-center rounded-full text-[8px] font-bold leading-none text-white" style={{ background: RIM_COLOR[tone] === '#a7aeb2' ? '#7d858a' : RIM_COLOR[tone] }}>{MARK[tone]}</span>
      {label}
      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" aria-hidden="true" />
    </div>
  );
}
