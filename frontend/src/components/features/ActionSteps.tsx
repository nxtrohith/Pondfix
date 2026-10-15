'use client';
import { FirstAid, Info } from '@phosphor-icons/react/dist/ssr';
import { actionKey } from '@/lib/care';
import { hasOwn } from '@/i18n';
import { useT } from '@/i18n/client';
import { ActionGuide } from '../illustrations/ActionGuide';
import { cx } from '../ui/cx';

interface Props {
  parameter?: string;
  direction?: 'low' | 'high';
  severity?: 'WARNING' | 'CRITICAL';
  /** Use the "no recent reading" steps instead of a parameter's. */
  stale?: boolean;
  /** Advice written for this alert by the backend (rules or a checked advisor), shown after the general steps. */
  backendAction?: string | null;
  /** Show only the first N steps (the rest is one tap away on the alert). */
  limit?: number;
  /** Repeat the "fish are gasping: do not wait" rule. On by default for urgent problems. */
  showAlways?: boolean;
  className?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
}

/**
 * Numbered, short steps for a problem, from the shared farmer dictionary (care.actions.*), which follows the project's safety guidance
 * (knowledge/07_safety). No step prescribes a chemical dose or a water-exchange amount: those need pond-specific information.
 */
export function ActionSteps({ parameter, direction, severity, stale, backendAction, limit, showAlways, className, headingLevel: H = 'h3' }: Props) {
  const t = useT();
  const key = stale ? 'care.actions.stale' : parameter ? actionKey(parameter, direction) : null;
  const steps = key ? t.list(key) : [];
  if (!steps.length && !backendAction) return null;
  const shown = limit ? steps.slice(0, limit) : steps;
  const urgent = severity === 'CRITICAL';
  const untranslated = key ? !hasOwn(t.lang, key) : false;
  return (
    <section className={cx('rounded-lg border p-4', urgent ? 'border-crit-line bg-card' : 'border-line bg-card', className)} aria-label={t('care.actions.title')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <H className="flex items-center gap-2 text-base font-semibold text-ink"><FirstAid size={20} weight="fill" aria-hidden="true" className={urgent ? 'text-crit-text' : 'text-brand'} />{t('care.actions.title')}</H>
          {shown.length ? (
            <ol className="mt-2 space-y-2" lang={untranslated ? 'en' : undefined}>
              {shown.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink">
                  <span aria-hidden="true" className={cx('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold', i === 0 && urgent ? 'bg-crit-text text-white' : 'bg-brand-pale text-brand-text')}>{i + 1}</span>
                  <span className={cx('pt-0.5', i === 0 && 'font-semibold')}>{s}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {backendAction ? <p className="mt-3 text-sm text-ink"><span className="font-medium">For this alert:</span> {backendAction}</p> : null}
        </div>
        {parameter && !stale ? <span className="hidden sm:block"><ActionGuide parameter={parameter} direction={direction} severity={severity ?? 'WARNING'} /></span> : null}
      </div>
      {(showAlways ?? urgent) || stale ? <p className="mt-3 flex items-start gap-2 rounded-md bg-crit-bg px-3 py-2 text-sm font-medium text-crit-text" lang={hasOwn(t.lang, 'care.actions.always') ? undefined : 'en'}><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{t('care.actions.always')}</p> : null}
      <p className="mt-2 text-xs text-ink-soft">{stale ? null : <>{t('care.actions.verify')} </>}{t('care.actions.general')}{untranslated ? <> · {t('language.draftNote')}</> : null}</p>
    </section>
  );
}
