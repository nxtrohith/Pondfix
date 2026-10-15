'use client';
import Link from 'next/link';
import type { ParamSummary, Rule } from '@/lib/api/schemas';
import { PARAM_ICON, acceptableText } from '@/lib/alerts';
import { formatValue, unitLabel, DEFAULT_UNIT } from '@/lib/format';
import { interpretationKey } from '@/lib/care';
import { useT } from '@/i18n/client';
import { ParameterEquipment } from '../illustrations';
import { StatusBadge } from '../ui/StatusBadge';
import { LastUpdated } from '../ui/LastUpdated';
import { cx } from '../ui/cx';

const SOURCE_KEY = { live: 'care.source.sensor', simulated: 'care.source.test', historical: 'care.source.historical' } as const;

/**
 * One water-quality factor right now: name, value, what it means for the fish (from the backend's own risk verdict), how recent it is,
 * where the number came from, the safe range (from the backend rules) and why it matters. A missing or old reading never looks healthy.
 */
export function WaterQualityCard({ parameter, reading, rule, direction }: { parameter: string; reading?: ParamSummary; rule?: Rule; /** Side of the limit, from an open alert, so "too high" and "too low" are told apart. */ direction?: 'low' | 'high' }) {
  const t = useT();
  const Icon = PARAM_ICON[parameter];
  const status = reading ? reading.risk : 'NO_DATA';
  const bad = status === 'WARNING' || status === 'CRITICAL';
  const notRecent = status === 'STALE';
  const side = direction ?? (reading && bad && rule ? (rule.acceptableRange.min !== null && reading.value < rule.acceptableRange.min ? 'low' : 'high') : undefined);
  const meaning = interpretationKey(parameter, status, side);
  const whyKey = `care.measure.${parameter}.why`;
  const why = t.raw(whyKey) === whyKey ? null : t.raw(whyKey);
  const nameKey = `care.measure.${parameter}.name`;
  const name = t.raw(nameKey) === nameKey ? parameter : t.raw(nameKey);
  return (
    <section aria-label={name} className={cx('flex flex-col rounded-xl border bg-card p-5', status === 'CRITICAL' ? 'border-2 border-crit-text/60' : bad ? 'border-2 border-warn-text/50' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">{Icon ? <Icon size={18} aria-hidden="true" className="text-brand" /> : null}{name}</h3>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className={cx('text-4xl font-semibold leading-none tracking-tight tabular-nums', notRecent || !reading ? 'text-ink-soft' : bad ? (status === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text') : 'text-ink')}>
          {reading ? formatValue(reading.value, parameter) : <span className="text-2xl">{t('care.measure.noReading')}</span>}
          {reading ? <span className="ml-1.5 text-base font-normal text-ink-soft">{unitLabel(reading.unit) || DEFAULT_UNIT[parameter]}</span> : null}
        </p>
        <span aria-hidden="true" className={cx('shrink-0', !reading && 'opacity-50 grayscale')}><ParameterEquipment parameter={parameter} size={64} className="-my-3" /></span>
      </div>
      {notRecent ? <p className="mt-3 text-[15px] font-medium text-warn-text">{t('care.measure.stale')}</p>
        : meaning ? <p className={cx('mt-3 text-[15px] font-medium', bad ? (status === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text') : 'text-ok-text')}>{t.raw(meaning)}</p> : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        {reading ? <><LastUpdated at={reading.recordedAt} ageMinutes={reading.ageMinutes} className={notRecent ? 'font-medium text-warn-text' : undefined} /><span className="rounded-full bg-surface px-2 py-0.5 text-xs">{t(SOURCE_KEY[reading.source])}</span></> : 'This pond has no reading for this yet.'}
      </p>
      {rule?.enabled ? <p className="mt-1 text-sm text-ink-soft">Safe range: <span className="font-medium text-ink">{acceptableText(rule)}</span>{rule.source === 'provisional_demo' ? ' (provisional)' : ''}</p> : null}
      {why ? (
        <details className="mt-auto pt-3 text-sm">
          <summary className="inline-flex min-h-10 cursor-pointer items-center font-medium text-brand-text">Why this matters</summary>
          <p className="text-ink">{why} <Link href={`/help#measure-${parameter}`} className="font-medium text-brand-text underline underline-offset-2">More in Help</Link></p>
        </details>
      ) : null}
    </section>
  );
}
