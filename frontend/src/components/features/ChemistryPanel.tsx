import type { ParamSummary } from '@/lib/api/schemas';
import { CHEMISTRY_HINT, CHEMISTRY_PARAMETERS, DERIVED_PARAMETERS, PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, PARAM_LABEL, SOURCE_LABEL, formatValue, unitLabel } from '@/lib/format';
import { LastUpdated } from '../ui/LastUpdated';
import { cx } from '../ui/cx';

/**
 * Extra water chemistry as a compact list. There is deliberately no status badge: the backend defines no alert limits for these,
 * so they must never look healthy or unhealthy. Each row says where the number comes from (test data, calculated, or a sensor).
 */
export function ChemistryPanel({ readings }: { readings: Record<string, ParamSummary | undefined> }) {
  const rows = CHEMISTRY_PARAMETERS.filter((p) => readings[p]);
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-card" aria-label="Other water chemistry">
      {rows.map((p) => {
        const r = readings[p]!; const Icon = PARAM_ICON[p];
        const stale = r.risk === 'STALE';
        const derived = DERIVED_PARAMETERS.includes(p);
        const tag = derived ? 'Calculated' : r.source !== 'live' ? SOURCE_LABEL[r.source] : null;
        return (
          <li key={p} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">{Icon ? <Icon size={15} aria-hidden="true" className="text-ink-soft" /> : null}{PARAM_LABEL[p]}
                {tag ? <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-normal text-ink-soft">{tag}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">{CHEMISTRY_HINT[p]}</p>
            </div>
            <div className="text-right">
              <p className={cx('text-xl font-medium tabular-nums tracking-tight', stale ? 'text-ink-soft' : 'text-ink')}>
                {formatValue(r.value, p)}<span className="ml-1 text-xs font-normal text-ink-soft">{unitLabel(r.unit) || DEFAULT_UNIT[p]}</span>
              </p>
              <p className="text-xs text-ink-soft"><LastUpdated at={r.recordedAt} ageMinutes={r.ageMinutes} className={stale ? 'font-medium text-warn-text' : undefined} /></p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
