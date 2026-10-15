import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import type { FleetRow } from '@/lib/fleet';
import { PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, PARAM_SHORT, SOURCE_LABEL, formatValue, unitLabel } from '@/lib/format';
import { POND_STATUS, describeProblem } from '@/lib/terms';
import { isConfigured, speciesLine } from '@/lib/species';
import { PondIllustration } from '../illustrations';
import { StatusBadge } from '../ui/StatusBadge';
import { LastUpdated } from '../ui/LastUpdated';
import { cx } from '../ui/cx';

const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
const EDGE = { CRITICAL: 'border-l-crit-text', WARNING: 'border-l-warn-text' } as const;

/** One pond at a glance: status in words, the three readings, what is wrong (if anything) and how recent the data is. */
export function PondCard({ row }: { row: FleetRow }) {
  const { pond, summary } = row;
  const problems = (summary?.openAlertItems ?? []).filter((a) => a.origin === 'observed');
  const upcoming = (summary?.openAlertItems ?? []).filter((a) => a.origin === 'predicted');
  const edge = row.risk === 'CRITICAL' || row.risk === 'WARNING' ? EDGE[row.risk] : 'border-l-line';
  return (
    <Link href={`/ponds/${pond.id}`} className={cx('block rounded-xl border border-line border-l-4 bg-card p-4 transition-colors hover:bg-surface/60', edge)} aria-label={`${pond.name}: ${POND_STATUS[row.risk].label}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="-my-2 -ml-1 shrink-0"><PondIllustration health={row.risk} size={64} alt="" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-medium text-ink">{pond.name}</h3>
            <StatusBadge status={row.risk} scope="pond" />
          </div>
          <p className={cx('mt-0.5 truncate text-xs', isConfigured(pond.speciesConfig) ? 'text-ink-soft' : 'text-warn-text')}>{speciesLine(pond.speciesConfig)}</p>
        </div>
      </div>
      {problems.length ? (
        <ul className="mt-2 space-y-0.5 text-sm font-medium text-ink">
          {problems.slice(0, 3).map((a) => <li key={a.id}>{describeProblem(a.parameter, a.direction, a.severity)}</li>)}
        </ul>
      ) : row.risk === 'NORMAL' || row.risk === 'ERROR' ? <p className="mt-2 text-sm text-ink-soft">{POND_STATUS[row.risk].summary}</p> : null}
      {upcoming.length ? <p className="mt-1 text-xs text-brand-text">Forecast warning: {upcoming.length === 1 ? 'a problem may develop soon' : `${upcoming.length} problems may develop soon`}</p> : null}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {PARAMS.map((p) => {
          const r = summary?.parameters[p]; const Icon = PARAM_ICON[p];
          const bad = r?.risk === 'WARNING' || r?.risk === 'CRITICAL';
          return (
            <div key={p} className={cx('rounded-lg px-1 py-2', bad ? (r!.risk === 'CRITICAL' ? 'bg-crit-bg' : 'bg-warn-bg') : 'bg-surface')}>
              <dt className="flex items-center justify-center gap-1 text-xs text-ink-soft">{Icon ? <Icon size={12} aria-hidden="true" /> : null}{PARAM_SHORT[p]}</dt>
              <dd className={cx('mt-0.5 text-sm font-medium tabular-nums', r?.risk === 'STALE' ? 'text-ink-soft' : 'text-ink')}>
                {r ? formatValue(r.value, p) : 'n/a'}<span className="ml-0.5 text-xs font-normal text-ink-soft">{r ? unitLabel(r.unit) : DEFAULT_UNIT[p]}</span>
                {bad ? <span className={cx('block text-xs', r!.risk === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text')}>{r!.risk === 'CRITICAL' ? 'Critical' : 'Warning'}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-soft">
        <span><LastUpdated at={row.latestAt} ageMinutes={row.latestAgeMinutes} className={row.risk === 'STALE' ? 'text-warn-text' : undefined} />{row.latestSource && row.latestSource !== 'live' ? <span className="ml-2 rounded-full bg-surface px-2 py-0.5">{SOURCE_LABEL[row.latestSource]}</span> : null}</span>
        <CaretRight size={14} aria-hidden="true" />
      </p>
    </Link>
  );
}
