import Link from 'next/link';
import { Binoculars, Warning, WarningOctagon } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, SOURCE_LABEL, formatDateTime, formatValue } from '@/lib/format';
import { RULE_SCOPE_LABEL, rangeText, REFERENCE_KIND } from '@/lib/species';
import { ALERT_STATE_TEXT, alertKind, describeForecastProblem, describeProblem, guidanceFor, levelText } from '@/lib/terms';
import { Button } from '../ui/Button';
import { AlertAdvisory } from './AlertAdvisory';
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
  const tip = !resolved && !forecast && showGuidance ? (a.recommendedAction ?? guidanceFor(a.parameter, a.direction)) : null;
  const tone = resolved ? 'text-ink-soft' : forecast ? 'text-olive-text' : a.severity === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text';
  const scope = a.ruleScope ?? 'general';
  const ref = a.referenceRange;
  return (
    <article className={cx('rounded-lg border border-line border-l-4 bg-card p-4', resolved ? 'border-l-ok-text' : EDGE[a.severity], forecast && !resolved && 'border-dashed border-l-solid')} aria-label={headline}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {!compact && pondName ? <Link href={`/ponds/${a.pondId}`} className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-card hover:opacity-90">{pondName}</Link> : null}
            <p className={cx('flex items-center gap-1.5 text-xs font-semibold', tone)}>
              <SevIcon size={15} weight="fill" aria-hidden="true" />{resolved ? `Earlier ${alertKind(a.origin).toLowerCase()}` : alertKind(a.origin)}{!resolved && !forecast ? `: ${a.severity === 'CRITICAL' ? 'critical' : 'warning'}` : ''}
            </p>
          </div>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-semibold leading-snug text-ink">{ParamIcon ? <ParamIcon size={18} className={cx('shrink-0', tone)} aria-hidden="true" /> : null}{headline}</h3>
        </div>
        {onMarkSeen && a.status === 'ACTIVE' ? <Button size="sm" disabled={busy} onClick={() => onMarkSeen(a)}>{busy ? 'Saving' : 'Mark as seen'}</Button> : null}
      </div>
      {forecast && !resolved ? <p className="mt-1 text-xs text-ink-soft">A forecast, not a measurement. It may not happen.</p> : null}
      <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
        <div className="flex items-baseline gap-1.5"><dt className="text-ink-soft">{forecast ? `Forecast${a.horizonMinutes ? ` in ${a.horizonMinutes < 60 ? `${a.horizonMinutes} min` : `${a.horizonMinutes / 60} h`}` : ''}:` : 'Current:'}</dt>{' '}<dd className={cx('text-lg font-semibold tabular-nums', resolved ? 'text-ink' : tone)}>{value}</dd></div>
        <div className={cx('font-medium', resolved ? 'text-ink-soft' : tone)}>{levelText(a.severity, a.direction, a.threshold, a.parameter)}</div>
      </dl>
      <p className="mt-1.5 text-[13px] text-ink-soft">{ALERT_STATE_TEXT[a.status]}{a.status === 'RESOLVED' && a.resolvedAt ? ` (${formatDateTime(a.resolvedAt)})` : ''}</p>
      {tip ? <p className="mt-2 rounded-md bg-surface px-3 py-2 text-[13px] text-ink">{a.recommendedAction ? 'Recommended next step' : 'What to check'}: {tip}</p> : null}
      <AlertAdvisory alert={a} />
      <section className="mt-2 text-[13px]" aria-label="Why this alert, and which limits">
        <div className="space-y-1.5">
          {!resolved && a.explanation ? <p className="text-ink-soft">{a.explanation}</p> : null}
          {!forecast || a.speciesLabel ? (
            <dl className="space-y-0.5">
              <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Species:</dt><dd className="text-ink">{a.speciesLabel ?? 'not set'}</dd></div>
              <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Limits used:</dt><dd className="text-ink">{RULE_SCOPE_LABEL[scope]}{scope === 'species' && a.profileVersion ? ` (${a.profileVersion})` : ''}{scope === 'general' ? <span className="text-ink-soft"> (not specific to a species)</span> : null}</dd></div>
              {ref ? <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Species reference:</dt><dd className="text-ink">{rangeText(ref)} <span className="text-xs text-ink-soft">({REFERENCE_KIND[ref.kind ?? ''] ?? 'reference'}; context, not an alert limit)</span></dd></div> : null}
            </dl>
          ) : null}
        </div>
      </section>
      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
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
