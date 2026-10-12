import type { ParamSummary, Rule } from '@/lib/api/schemas';
import { PARAM_ICON, acceptableText } from '@/lib/alerts';
import { PARAM_LABEL, SOURCE_LABEL, formatValue, unitLabel, DEFAULT_UNIT } from '@/lib/format';
import { StatusBadge } from '../ui/StatusBadge';
import { LastUpdated } from '../ui/LastUpdated';
import { cx } from '../ui/cx';

/** One water-quality factor right now: value, status, how recent it is, and the range that counts as normal (from the backend rules). */
export function WaterQualityCard({ parameter, reading, rule }: { parameter: string; reading?: ParamSummary; rule?: Rule }) {
  const Icon = PARAM_ICON[parameter];
  const status = reading ? reading.risk : 'NO_DATA';
  const bad = status === 'WARNING' || status === 'CRITICAL';
  const notRecent = status === 'STALE';
  return (
    <section aria-label={PARAM_LABEL[parameter]} className={cx('rounded-xl border bg-card p-5', status === 'CRITICAL' ? 'border-crit-text/50' : bad ? 'border-warn-text/40' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">{Icon ? <Icon size={16} aria-hidden="true" /> : null}{PARAM_LABEL[parameter]}</p>
        <StatusBadge status={status} />
      </div>
      <p className={cx('mt-3 text-3xl font-medium leading-none tracking-tight tabular-nums', notRecent || !reading ? 'text-ink-soft' : 'text-ink')}>
        {reading ? formatValue(reading.value, parameter) : 'No reading'}
        {reading ? <span className="ml-1.5 text-sm font-normal text-ink-soft">{unitLabel(reading.unit) || DEFAULT_UNIT[parameter]}</span> : null}
      </p>
      <p className="mt-2.5 text-xs text-ink-soft">
        {reading ? <><LastUpdated at={reading.recordedAt} ageMinutes={reading.ageMinutes} className={notRecent ? 'font-medium text-warn-text' : undefined} />{reading.source !== 'live' ? <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px]">{SOURCE_LABEL[reading.source]}</span> : null}</> : 'This pond has no reading for this yet.'}
      </p>
      {rule?.enabled ? <p className="mt-2 text-xs text-ink-soft">Normal: {acceptableText(rule)}{rule.source === 'provisional_demo' ? ' (provisional limit)' : ''}</p> : null}
    </section>
  );
}
