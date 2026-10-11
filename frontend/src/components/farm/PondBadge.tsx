import { TONE_COLOR, type Tone } from '@/lib/farm';
import { cx } from '../ui/cx';

const ICON: Record<Tone, React.ReactNode> = {
  critical: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 .8h4L11.2 4v4L8 11.2H4L.8 8V4z" fill="currentColor" /><path d="M6 3.2v3.4M6 8v.1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  warning: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.4 10.6H.6z" fill="currentColor" /><path d="M6 4.4v3M6 8.6v.1" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  healthy: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="currentColor" /><path d="M3.6 6.2 5.2 7.8 8.4 4.4" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  unknown: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="currentColor" /><path d="M3.6 6h4.8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>,
};

/** The small tag on each pond: its place number plus a status shape, so state never depends on colour alone. */
export function PondBadge({ label, tone, empty, selected, dim }: { label: string; tone: Tone; empty: boolean; selected: boolean; dim: boolean }) {
  if (empty) return <div className="select-none whitespace-nowrap rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-[#6a6c62]">{label}</div>;
  return (
    <div className={cx('flex select-none items-center gap-1 whitespace-nowrap rounded-full border bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#34372f] shadow-sm', selected && 'ring-2 ring-[#34372f]', dim && 'opacity-50')} style={{ borderColor: TONE_COLOR[tone] }}>
      <span style={{ color: TONE_COLOR[tone] }}>{ICON[tone]}</span>{label}
    </div>
  );
}
