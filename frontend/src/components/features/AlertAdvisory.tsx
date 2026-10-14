import { BellRinging, Cpu, LinkSimple, ListNumbers, ShieldCheck, Sparkle, WarningDiamond } from '@phosphor-icons/react/dist/ssr';
import type { Alert } from '@/lib/api/schemas';
import { PARAM_LABEL } from '@/lib/format';
import { cx } from '../ui/cx';

const CHANNEL = { in_app: 'In-app only', push: 'Push notification', sms: 'SMS or phone call' } as const;
const label = (p: string) => PARAM_LABEL[p] ?? p;
const urgencyText = (u?: number) => (u === undefined ? null : u < 0.75 ? 'keep monitoring' : u < 1.5 ? 'needs attention soon' : 'needs action now');

/**
 * The alert advisor's output for one alert: which factor to deal with first, whether the reading may be a sensor fault, related alerts,
 * a suggested channel and (for observed critical alerts) suggested steps. All of it is a suggestion; the alert itself comes from the limits.
 */
export function AlertAdvisory({ alert: a }: { alert: Alert }) {
  const adv = a.advisory;
  if (!adv || a.status === 'RESOLVED') return null;
  const sol = adv.solution;
  const held = adv.guard && !adv.guard.passed && sol?.source === 'rules' && adv.guard.reasons.some((r) => !r.startsWith('llm failed'));
  return (
    <section className="mt-3 rounded-lg border border-line bg-sage-pale/50 p-3 text-[13px]" aria-label="Suggested priorities and next steps">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-olive-text"><Sparkle size={15} weight="fill" aria-hidden="true" />Suggested priorities and next steps</p>
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-xs text-ink-soft">{adv.analysedBy === 'jev' ? 'Analysed by Jev' : 'Rules only: analysis service unavailable'}</span>
      </div>

      {adv.sensorFault?.flagged ? (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-warn-bg px-3 py-2 text-warn-text">
          <WarningDiamond size={16} className="mt-px shrink-0" weight="fill" aria-hidden="true" />
          <span><span className="font-medium">This reading may be a sensor fault</span> ({Math.round(adv.sensorFault.probability * 100)}% likely). Check the sensor against a second meter or test kit before acting. The alert stays open until readings recover.</span>
        </p>
      ) : null}

      {adv.priorities.length >= 2 ? (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 font-medium text-ink"><ListNumbers size={15} aria-hidden="true" />Deal with these in this order</p>
          <ol className="mt-1 space-y-0.5">
            {adv.priorities.map((p, i) => (
              <li key={p.parameter} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-4 text-ink-soft tabular-nums">{i + 1}.</span>
                <span className="font-medium text-ink">{label(p.parameter)}</span>
                <span className={cx('text-xs font-medium', p.status === 'CRITICAL' ? 'text-crit-text' : 'text-warn-text')}>{p.status === 'CRITICAL' ? 'critical' : 'warning'}</span>
                {urgencyText(p.jevUrgency) ? <span className="text-xs text-ink-soft">{urgencyText(p.jevUrgency)}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {sol ? (
        <div className="mt-3 rounded-md bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">Suggested next steps</p>
            <span className="flex items-center gap-1 text-xs text-ink-soft">
              {sol.source === 'llm' ? <><Cpu size={13} aria-hidden="true" />Written by AI, passed a safety check</> : <><ShieldCheck size={13} aria-hidden="true" />Standard guidance</>}
            </span>
          </div>
          <p className="mt-1 text-ink-soft">{sol.summary}</p>
          <p className="mt-1.5 text-ink"><span className="font-medium">Check first:</span> {sol.verifyFirst}</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-ink">{sol.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {held ? <p className="mt-1.5 text-xs text-ink-soft">An AI-written answer was held back by the safety check, so standard guidance is shown instead.</p> : null}
        </div>
      ) : null}

      {adv.forecastActionable ? (
        <p className="mt-2 text-ink">{adv.forecastActionable.actionable ? <><span className="font-medium">Worth acting on now.</span> The forecast looks serious enough to prepare for.</> : <><span className="font-medium">Probably not urgent yet.</span> Keep an eye on it as new readings arrive.</>} <span className="text-xs text-ink-soft">({Math.round(adv.forecastActionable.probability * 100)}%)</span></p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1"><BellRinging size={13} aria-hidden="true" />Suggested alert channel: <span className="font-medium text-ink">{CHANNEL[adv.notify.channel]}</span></span>
        {adv.incident ? <span className="flex items-center gap-1"><LinkSimple size={13} aria-hidden="true" />Likely the same problem as: <span className="font-medium text-ink">{adv.incident.relatedParameters.map(label).join(', ')}</span></span> : null}
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">These are suggestions. Whether an alert exists is decided only by the configured limits.</p>
    </section>
  );
}
