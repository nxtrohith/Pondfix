import { PARAM_SHORT, formatAge, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { describeProblem, POND_STATUS } from '@/lib/terms';
import type { PondSnapshot } from '@/lib/farm';
import { StatusBadge } from '../ui/StatusBadge';

/** Compact hover card: name, status, the three readings, when they were taken, and what (if anything) is wrong. */
export function PondTooltip({ snap, demo }: { snap: PondSnapshot; demo?: boolean }) {
  const old = snap.risk === 'STALE';
  return (
    <div className="w-64 rounded-lg border border-line bg-card p-3 text-xs shadow-[0_4px_16px_rgba(52,55,47,0.14)]" role="status">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-[13px] font-medium text-ink">{snap.name}</p>{demo ? <p className="text-[11px] text-olive-text">Demo fixture</p> : null}</div>
        <StatusBadge status={snap.risk} scope="pond" />
      </div>
      {snap.readings.length ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {(['dissolved_oxygen', 'ph', 'temperature'] as const).map((p) => { const r = snap.readings.find((x) => x.parameter === p); return (
            <div key={p} className="contents"><dt className="text-ink-soft">{PARAM_SHORT[p]}</dt><dd className="tabular-nums text-ink">{r ? `${formatValue(r.value, p)} ${unitLabel(r.unit)}`.trim() : <span className="text-ink-soft">unavailable</span>}</dd></div>
          ); })}
        </dl>
      ) : <p className="mt-2 text-ink-soft">{POND_STATUS[snap.risk].summary}</p>}
      <p className="mt-2 text-ink-soft">{snap.latestAt ? <>Latest reading {formatDateTime(snap.latestAt)} ({formatAge(snap.latestAgeMinutes)}){old ? '. Not recent, so the condition is unknown.' : ''}</> : 'No reading yet'}</p>
      {snap.problems.length ? (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2 font-medium text-ink">
          {snap.problems.slice(0, 2).map((a) => <li key={a.id}>{describeProblem(a.parameter, a.direction, a.severity)}</li>)}
          {snap.problems.length > 2 ? <li className="font-normal text-ink-soft">and {snap.problems.length - 2} more</li> : null}
        </ul>
      ) : null}
      {snap.forecastWarnings ? <p className="mt-1.5 text-olive-text">Forecast warning: a problem may develop soon</p> : null}
    </div>
  );
}
