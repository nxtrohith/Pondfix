import Link from 'next/link';
import { Binoculars, Warning, WarningOctagon } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, SOURCE_LABEL, formatDateTime, formatValue } from '@/lib/format';
import { ALERT_STATE_TEXT, alertKind, describeForecastProblem, describeProblem, guidanceFor, levelText } from '@/lib/terms';
import { Button } from '../ui/Button';
import { SourceBadge } from '../ui/StatusPill';
import { cx } from '../ui/cx';

interface Props {
  alert: Alert;
  pondName?: string;
  onMarkSeen?: (a: Alert) => void;
  busy?: boolean;
  /** Hide pond name, timestamps and source (for use inside a pond's own page or a pond card). */
  compact?: boolean;
  showGuidance?: boolean;
}

const EDGE = { CRITICAL: 'border-l-crit-text', WARNING: 'border-l-warn-text' } as const;

/**
 * The one way an alert is shown anywhere in the app: a plain-language headline, whether it is happening now or only forecast,
 * the current value, the level that was crossed, and what state it is in.
 */
export function AlertCard({ alert: a, pondName, onMarkSeen, busy, compact, showGuidance }: Props) {
  const forecast = a.origin === 'predicted';
  const resolved = a.status === 'RESOLVED';
  const headline = forecast ? describeForecastProblem(a.parameter, a.direction, a.severity, a.horizonMinutes) : describeProblem(a.parameter, a.direction, a.severity);
  const ParamIcon = PARAM_ICON[a.parameter];
  const SevIcon = forecast ? Binoculars : a.severity === 'CRITICAL' ? WarningOctagon : Warning;
  const unit = DEFAULT_UNIT[a.parameter] ?? '';
  const value = `${formatValue(a.triggerValue, a.parameter)}${unit ? ` ${unit}` : ''}`;
  const tip = !resolved && !forecast && showGuidance ? guidanceFor(a.parameter, a.direction) : null;
  return (
    <article className={cx('rounded-lg border border-line border-l-4 bg-card p-4', resolved ? 'border-l-ok-text' : EDGE[a.severity], forecast && !resolved && 'border-dashed border-l-solid')} aria-label={headline}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className={cx('flex items-center gap-1.5 text-xs font-medium', resolved ? 'text-ink-soft' : forecast ? 'text-olive-text' : a.severity === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text')}>
            <SevIcon size={15} weight="fill" aria-hidden="true" />{resolved ? `Earlier ${alertKind(a.origin).toLowerCase()}` : alertKind(a.origin)}{!resolved && !forecast ? `: ${a.severity === 'CRITICAL' ? 'critical' : 'warning'}` : ''}
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-[15px] font-medium leading-snug text-ink">{ParamIcon ? <ParamIcon size={16} className="shrink-0 text-ink-soft" aria-hidden="true" /> : null}{headline}</h3>
        </div>
        {onMarkSeen && a.status === 'ACTIVE' ? <Button size="sm" disabled={busy} onClick={() => onMarkSeen(a)}>{busy ? 'Saving' : 'Mark as seen'}</Button> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
        <div className="flex gap-1.5"><dt className="text-ink-soft">{forecast ? `Forecast${a.horizonMinutes ? ` in ${a.horizonMinutes < 60 ? `${a.horizonMinutes} min` : `${a.horizonMinutes / 60} h`}` : ''}:` : 'Current:'}</dt>{' '}<dd className="font-medium tabular-nums text-ink">{value}</dd></div>
        <div className="text-ink-soft">{levelText(a.severity, a.direction, a.threshold, a.parameter)}</div>
      </dl>
      <p className="mt-1.5 text-[13px] text-ink-soft">{ALERT_STATE_TEXT[a.status]}{a.status === 'RESOLVED' && a.resolvedAt ? ` (${formatDateTime(a.resolvedAt)})` : ''}</p>
      {forecast && !resolved ? <p className="mt-1 text-xs text-ink-soft">This is a forecast, not a measurement. It may not happen.</p> : null}
      {tip ? <p className="mt-2 rounded-md bg-surface px-3 py-2 text-[13px] text-ink">What to check: {tip}</p> : null}
      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          {pondName ? <Link href={`/ponds/${a.pondId}`} className="font-medium text-ink hover:text-olive-text hover:underline">{pondName}</Link> : null}
          <span>Started {formatDateTime(a.createdAt)}</span>
          {a.lastTriggeredAt !== a.createdAt ? <span>Last confirmed {formatDateTime(a.lastTriggeredAt)}</span> : null}
          {a.dataSource && a.dataSource !== 'live' ? <SourceBadge source={a.dataSource} /> : null}
        </div>
      ) : null}
      <span className="sr-only">Based on {a.dataSource ? SOURCE_LABEL[a.dataSource] : 'recorded'} readings.</span>
    </article>
  );
}

export function AlertCardList({ alerts, pondNames, ...rest }: { alerts: Alert[]; pondNames?: Record<string, string> } & Omit<Props, 'alert' | 'pondName'>) {
  return <ul className="space-y-3">{alerts.map((a) => <li key={a.id}><AlertCard alert={a} pondName={pondNames?.[a.pondId]} {...rest} /></li>)}</ul>;
}
