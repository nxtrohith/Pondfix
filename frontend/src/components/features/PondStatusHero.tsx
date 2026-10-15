'use client';
import Link from 'next/link';
import { CheckCircle, Question, Warning, WarningOctagon, ClockCountdown } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { formatAge, formatDateTime } from '@/lib/format';
import { describeProblem } from '@/lib/terms';
import { formatDuration, freshness, interpretationKey, type Verdict } from '@/lib/care';
import { useT } from '@/i18n/client';
import { ConnectionPill } from '../shell/ConnectionPill';
import { linkButtonClass } from '../ui/Button';
import { ActionSteps } from './ActionSteps';
import { cx } from '../ui/cx';

const LOOK: Record<Verdict, { Icon: typeof CheckCircle; box: string; icon: string }> = {
  urgent: { Icon: WarningOctagon, box: 'border-crit-text/50 bg-crit-bg', icon: 'text-crit-text' },
  attention: { Icon: Warning, box: 'border-warn-text/40 bg-warn-bg', icon: 'text-warn-text' },
  healthy: { Icon: CheckCircle, box: 'border-ok-text/30 bg-ok-bg', icon: 'text-ok-text' },
  unknown: { Icon: Question, box: 'border-line-strong bg-stale-bg', icon: 'text-stale-text' },
};

export interface HeroProps {
  verdict: Verdict;
  /** Plain-language summary from summarizeOverview, e.g. "1 pond has a critical problem". */
  headline: string;
  counts: { urgent: number; attention: number; healthy: number; unknown: number; total: number };
  latestAt: string | null;
  latestAgeMinutes: number | null;
  staleAfterMinutes?: number;
  /** The single most urgent measured problem, if any: its steps are shown right here. */
  top: (Pick<Alert, 'id' | 'pondId' | 'parameter' | 'direction' | 'severity' | 'recommendedAction' | 'dataSource'> & { pondName: string }) | null;
  testData?: boolean;
}

/**
 * Answers, in this order: Is my pond safe? Is anything wrong? What should I do? When was the data last updated?
 * The verdict comes from farmVerdict (never healthy without recent data); the steps from the shared farmer dictionary.
 */
export function PondStatusHero({ verdict, headline, counts, latestAt, latestAgeMinutes, staleAfterMinutes = 60, top, testData }: HeroProps) {
  const t = useT();
  const look = LOOK[verdict];
  const fresh = freshness(latestAgeMinutes, staleAfterMinutes);
  const meaning = top ? interpretationKey(top.parameter, top.severity, top.direction) : null;
  return (
    <section aria-labelledby="pond-status-title" className="space-y-4">
      <div className={cx('rounded-2xl border-2 p-5 sm:p-6', look.box)} role={verdict === 'urgent' ? 'alert' : undefined}>
        <div className="flex items-start gap-4">
          <look.Icon size={44} weight="fill" aria-hidden="true" className={cx('shrink-0', look.icon)} />
          <div className="min-w-0 flex-1">
            <h2 id="pond-status-title" className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl" data-testid="pond-verdict">{t(`care.verdict.${verdict}.title`)}</h2>
            <p className="mt-1 text-[17px] leading-snug text-ink">{t(`care.verdict.${verdict}.body`)}</p>
            <p className="mt-2 text-[15px] font-medium text-ink" data-testid="overview-headline">{headline}{testData ? <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-brand-text">{t('home.testData')}</span> : null}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Ponds by condition">
          {([
            ['urgent', counts.urgent, 'Urgent', WarningOctagon, 'text-crit-text'],
            ['attention', counts.attention, 'Attention', Warning, 'text-warn-text'],
            ['healthy', counts.healthy, 'Healthy', CheckCircle, 'text-ok-text'],
            ['unknown', counts.unknown, 'No recent reading', Question, 'text-stale-text'],
          ] as const).map(([k, n, label, Icon, cls]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-card/80 px-3 py-2">
              <Icon size={20} weight="fill" aria-hidden="true" className={cls} />
              <dt className="min-w-0 flex-1 text-sm leading-tight text-ink-soft">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">{n}</dd>
            </div>
          ))}
        </dl>
        <p className={cx('mt-3 flex flex-wrap items-center gap-x-2 text-sm', fresh === 'current' ? 'text-ink-soft' : 'font-medium text-warn-text')}>
          <ClockCountdown size={16} aria-hidden="true" />
          {latestAt ? <span title={formatDateTime(latestAt)}>{t('home.lastReading', { age: formatAge(latestAgeMinutes) })} <span className="font-normal text-ink-soft">({formatDateTime(latestAt)})</span></span> : <span>{t('home.lastReadingNever')}</span>}
        </p>
        {fresh === 'delayed' || fresh === 'notReporting' ? (
          <p className="mt-2 rounded-lg bg-card px-3 py-2 text-sm text-ink" role="status">
            <span className="font-semibold">{t(fresh === 'delayed' ? 'care.connection.delayed.title' : 'care.connection.deviceOffline.title')}.</span>{' '}
            {t(fresh === 'delayed' ? 'care.connection.delayed.body' : 'care.connection.deviceOffline.body', { age: formatDuration(latestAgeMinutes ?? 0) })}{' '}
            <Link href="/help#troubleshoot" className="font-medium text-brand-text underline underline-offset-2">{t('care.connection.help')}</Link>
          </p>
        ) : null}
        <ConnectionPill full className="mt-3" />
      </div>

      {top ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-base text-ink">
              <span className="font-semibold">{t('home.worstPond', { pond: top.pondName })}</span>: {describeProblem(top.parameter, top.direction, top.severity)}.
              {meaning ? <span className="block text-ink-soft">{t.raw(meaning)}</span> : null}
            </p>
            <Link href={`/ponds/${top.pondId}`} className={linkButtonClass('primary')}>{t('home.openPond', { pond: top.pondName })}</Link>
          </div>
          <ActionSteps parameter={top.parameter} direction={top.direction} severity={top.severity} backendAction={top.recommendedAction} headingLevel="h3" />
        </div>
      ) : verdict === 'unknown' ? (
        <ActionSteps stale headingLevel="h3" />
      ) : null}
    </section>
  );
}

/** The same verdict for one pond, at the top of its page: is it safe, and how old is the data. */
export function PondVerdictBanner({ verdict, latestAt, latestAgeMinutes, staleAfterMinutes = 60 }: { verdict: Verdict; latestAt: string | null; latestAgeMinutes: number | null; staleAfterMinutes?: number }) {
  const t = useT();
  const look = LOOK[verdict];
  const fresh = freshness(latestAgeMinutes, staleAfterMinutes);
  return (
    <div className={cx('rounded-2xl border-2 p-5', look.box)} role={verdict === 'urgent' ? 'alert' : undefined}>
      <div className="flex items-start gap-3">
        <look.Icon size={36} weight="fill" aria-hidden="true" className={cx('shrink-0', look.icon)} />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight tracking-tight text-ink" data-testid="pond-verdict">{t(`care.verdict.${verdict}.title`)}</p>
          <p className="mt-1 text-[15px] text-ink">{t(`care.verdict.${verdict}.body`)}</p>
          <p className={cx('mt-2 flex items-center gap-1.5 text-sm', fresh === 'current' ? 'text-ink-soft' : 'font-medium text-warn-text')}>
            <ClockCountdown size={16} aria-hidden="true" />
            {latestAt ? <span title={formatDateTime(latestAt)}>{t('home.lastReading', { age: formatAge(latestAgeMinutes) })}</span> : t('home.lastReadingNever')}
            {fresh === 'delayed' || fresh === 'notReporting' ? <> · <Link href="/help#troubleshoot" className="underline underline-offset-2">{t(fresh === 'delayed' ? 'care.connection.delayed.title' : 'care.connection.deviceOffline.title')}</Link></> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
