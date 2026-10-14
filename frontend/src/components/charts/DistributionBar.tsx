import { cx } from '../ui/cx';

export interface Segment { key: string; label: string; count: number; bar: string; text: string }

/** Composition of a whole. Plain layout (no chart library, no track): segment widths are real counts. */
export function DistributionBar({ segments, total, unitLabel }: { segments: Segment[]; total: number; unitLabel: string }) {
  const shown = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.count} ${s.label}`).join(', ')}>
        {shown.map((s) => <div key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.bar }} />)}
      </div>
      <ul className="mt-4 divide-y divide-line/70">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 py-2 text-[13px]">
            <span className="flex items-center gap-2.5 text-ink">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: s.bar }} />
              {s.label}
            </span>
            <span className={cx('tabular-nums', s.count ? 'font-medium text-ink' : 'text-ink-soft')}>
              {s.count}<span className="ml-1.5 font-normal text-ink-soft">{total ? `${Math.round((s.count / total) * 100)}%` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-ink-soft">{total} {unitLabel} in total</p>
    </div>
  );
}
