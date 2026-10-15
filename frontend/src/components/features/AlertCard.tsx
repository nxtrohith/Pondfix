'use client';
import Link from 'next/link';
import { Binoculars, CheckCircle, ClockCountdown, Eye, Warning, WarningOctagon } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { PARAM_ICON } from '@/lib/alerts';
import { DEFAULT_UNIT, SOURCE_LABEL, formatAge, formatDateTime, formatValue } from '@/lib/format';
import { RULE_SCOPE_LABEL, rangeText, REFERENCE_KIND } from '@/lib/species';
import { ALERT_STATE_TEXT, describeForecastProblem, describeProblem, levelText } from '@/lib/terms';
import { formatDuration, interpretationKey } from '@/lib/care';
import { useT } from '@/i18n/client';
import { useNow } from '@/lib/useNow';
import { Button } from '../ui/Button';
import { AlertAdvisory } from './AlertAdvisory';
import { ActionSteps } from './ActionSteps';
import { SourceBadge } from '../ui/StatusPill';
import { cx } from '../ui/cx';

interface Props {
  alert: Alert;
  pondName?: string;
  onMarkSeen?: (a: Alert) => void;
  busy?: boolean;
  /** Hide pond name, timestamps and source (for use inside a pond's own page or a pond card). */
  compact?: boolean;
  /** Show the numbered "What to do now" steps. */
  showGuidance?: boolean;
  /** Show only the first N steps on the card; all of them are then under "More about this alert". */
  stepsLimit?: number;
  /** "Now" for ages; defaults to the render time. Fixed in tests. */
  now?: number;
  /** A reading older than this is not current (the backend's STALE_AFTER_MINUTES). */
  staleAfterMinutes?: number;
}

const EDGE = { CRITICAL: 'border-l-crit-text', WARNING: 'border-l-warn-text' } as const;
const minutesSince = (iso: string, now: number) => Math.max(0, (now - Date.parse(iso)) / 60000);

/**
 * The one way an alert is shown anywhere in the app. In order: how serious (word + icon + colour), what happened, what it means for the
 * fish, the reading and the limit, when it was detected and whether that reading is still current, what to do, then the details.
 * "Mark as seen" only records that someone saw it; the alert closes by itself when readings recover.
 */
export function AlertCard({ alert: a, pondName, onMarkSeen, busy, compact, showGuidance, stepsLimit, now: fixedNow, staleAfterMinutes = 60 }: Props) {
  const t = useT();
  const clock = useNow();
  const now = fixedNow ?? clock;
  const forecast = a.origin === 'predicted';
  const resolved = a.status === 'RESOLVED';
  const critical = a.severity === 'CRITICAL';
  const headline = forecast ? describeForecastProblem(a.parameter, a.direction, a.severity, a.horizonMinutes) : describeProblem(a.parameter, a.direction, a.severity);
  const ParamIcon = PARAM_ICON[a.parameter];
  const SevIcon = resolved ? CheckCircle : forecast ? Binoculars : critical ? WarningOctagon : Warning;
  const sevWord = resolved ? t('care.severity.resolved') : forecast ? t('care.severity.forecast') : critical ? t('care.severity.urgent') : t('care.severity.warning');
  const unit = DEFAULT_UNIT[a.parameter] ?? '';
  const value = `${formatValue(a.triggerValue, a.parameter)}${unit ? ` ${unit}` : ''}`;
  const tone = resolved ? 'text-ok-text' : forecast ? 'text-brand-text' : critical ? 'text-crit-text' : 'text-warn-text';
  const chip = resolved ? 'bg-ok-bg text-ok-text' : forecast ? 'bg-brand-pale text-brand-text' : critical ? 'bg-crit-text text-white' : 'bg-warn-bg text-warn-text';
  const meaningKey = forecast ? null : interpretationKey(a.parameter, a.severity, a.direction);
  const whyKey = `care.measure.${a.parameter}.why`;
  const why = t.raw(whyKey) === whyKey ? null : t.raw(whyKey);
  // The reading that confirmed this alert last: if it is old, the farmer must know the pond may have changed since.
  const confirmedAge = minutesSince(a.lastTriggeredAt, now);
  const notCurrent = !resolved && !forecast && confirmedAge > staleAfterMinutes;
  const scope = a.ruleScope ?? 'general';
  const ref = a.referenceRange;
  const statusWord = resolved ? 'Resolved' : a.status === 'ACKNOWLEDGED' ? 'Seen, still open' : 'Active';
  return (
    <article className={cx('rounded-xl border border-line border-l-4 bg-card p-4 sm:p-5', resolved ? 'border-l-ok-text' : forecast ? 'border-l-brand-soft border-dashed' : EDGE[a.severity])} aria-label={headline}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold uppercase tracking-wide', chip)}>
          <SevIcon size={15} weight="fill" aria-hidden="true" />{sevWord}
        </span>
        {!compact && pondName ? <Link href={`/ponds/${a.pondId}`} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-sm font-semibold text-ink hover:bg-surface">{pondName}</Link> : null}
        <span className="text-sm text-ink-soft">{statusWord}</span>
        {a.dataSource && a.dataSource !== 'live' ? <SourceBadge source={a.dataSource} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-snug text-ink">{ParamIcon ? <ParamIcon size={20} className={cx('shrink-0', tone)} aria-hidden="true" /> : null}{headline}</h3>
          {meaningKey && !resolved ? <p className="mt-0.5 text-[15px] text-ink">{t.raw(meaningKey)}</p> : null}
          {forecast && !resolved ? <p className="mt-0.5 text-sm text-ink-soft">A forecast, not a measurement. It may not happen.</p> : null}
        </div>
        {onMarkSeen && a.status === 'ACTIVE' ? <Button size="sm" disabled={busy} onClick={() => onMarkSeen(a)}><Eye size={16} aria-hidden="true" />{busy ? 'Saving' : 'Mark as seen'}</Button> : null}
      </div>

      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5"><dt className="text-ink-soft">{forecast ? `Forecast${a.horizonMinutes ? ` in ${a.horizonMinutes < 60 ? `${a.horizonMinutes} min` : `${a.horizonMinutes / 60} h`}` : ''}:` : 'Current:'}</dt>{' '}<dd className={cx('text-xl font-semibold tabular-nums', resolved ? 'text-ink' : tone)}>{value}</dd></div>
        <div className={cx('font-medium', resolved ? 'text-ink-soft' : tone)}>{levelText(a.severity, a.direction, a.threshold, a.parameter)}</div>
      </dl>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span title={formatDateTime(a.createdAt)}>Detected {formatAge(minutesSince(a.createdAt, now))}</span>
        {!compact && a.lastTriggeredAt !== a.createdAt && !notCurrent ? <span title={formatDateTime(a.lastTriggeredAt)}>Last confirmed {formatAge(confirmedAge)}</span> : null}
        {resolved && a.resolvedAt ? <span>Resolved {formatDateTime(a.resolvedAt)}</span> : null}
      </p>
      {notCurrent ? (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-text" data-testid="alert-not-current">
          <ClockCountdown size={18} aria-hidden="true" className="mt-px shrink-0" />
          <span><span className="font-semibold">No fresh reading for {formatDuration(confirmedAge)}.</span> <span className="text-ink">The pond may have changed. Check the fish and the pond device.</span></span>
        </p>
      ) : null}

      {showGuidance && !resolved && !forecast ? <ActionSteps className="mt-3" parameter={a.parameter} direction={a.direction} severity={a.severity} backendAction={stepsLimit ? null : a.recommendedAction} limit={stepsLimit} showAlways={false} headingLevel="h4" /> : null}

      <details className="group mt-3 text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg font-medium text-brand-text hover:underline">More about this alert</summary>
        <div className="mt-2 space-y-2">
          {why ? <p className="text-ink"><span className="font-medium">Why it matters: </span>{why}</p> : null}
          {showGuidance && stepsLimit && !resolved && !forecast ? <ActionSteps parameter={a.parameter} direction={a.direction} severity={a.severity} backendAction={a.recommendedAction} showAlways={false} headingLevel="h4" /> : null}
          {!resolved && a.explanation ? <p className="text-ink-soft">{a.explanation}</p> : null}
          <AlertAdvisory alert={a} />
          {!forecast || a.speciesLabel ? (
            <dl className="space-y-0.5">
              <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Species:</dt><dd className="text-ink">{a.speciesLabel ?? 'not set'}</dd></div>
              <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Limits used:</dt><dd className="text-ink">{RULE_SCOPE_LABEL[scope]}{scope === 'species' && a.profileVersion ? ` (${a.profileVersion})` : ''}{scope === 'general' ? <span className="text-ink-soft"> (not specific to a species)</span> : null}</dd></div>
              {ref ? <div className="flex flex-wrap gap-x-1.5"><dt className="text-ink-soft">Species reference:</dt><dd className="text-ink">{rangeText(ref)} <span className="text-xs text-ink-soft">({REFERENCE_KIND[ref.kind ?? ''] ?? 'reference'}; context, not an alert limit)</span></dd></div> : null}
            </dl>
          ) : null}
          <p className="text-ink-soft">{ALERT_STATE_TEXT[a.status]}. Detected {formatDateTime(a.createdAt)}.{a.status !== 'RESOLVED' ? ' Marking it as seen does not close it: it closes by itself when readings are back to normal.' : ''}</p>
        </div>
      </details>
      <span className="sr-only">Based on {a.dataSource ? SOURCE_LABEL[a.dataSource] : 'recorded'} readings.</span>
    </article>
  );
}

export function AlertCardList({ alerts, pondNames, ...rest }: { alerts: Alert[]; pondNames?: Record<string, string> } & Omit<Props, 'alert' | 'pondName'>) {
  return <ul className="space-y-3">{alerts.map((a) => <li key={a.id}><AlertCard alert={a} pondName={pondNames?.[a.pondId]} {...rest} /></li>)}</ul>;
}
