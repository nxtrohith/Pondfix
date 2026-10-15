import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, Question, Warning, WarningOctagon, WifiHigh, CloudCheck, Cpu, ArrowsClockwise, ChatCircleText } from '@phosphor-icons/react/dist/ssr';
import { serverApi } from '@/lib/api/client';
import { acceptableText, PARAM_ICON } from '@/lib/alerts';
import { getT } from '@/i18n/server';
import { hasOwn } from '@/i18n';
import { PageHeader } from '@/components/ui/PageHeader';
import { linkButtonClass } from '@/components/ui/Button';
import { ActionSteps } from '@/components/features/ActionSteps';

export const metadata: Metadata = { title: 'Help' };
export const dynamic = 'force-dynamic';

const MEASURES = ['dissolved_oxygen', 'ph', 'temperature', 'ammonia', 'nitrite', 'alkalinity'] as const;
const EMERGENCIES = [
  { parameter: 'dissolved_oxygen', direction: 'low', title: 'Oxygen is low' },
  { parameter: 'ph', direction: 'high', title: 'pH is too high' },
  { parameter: 'ph', direction: 'low', title: 'pH is too low' },
  { parameter: 'temperature', direction: 'high', title: 'Water is too warm' },
  { parameter: 'ammonia', direction: 'high', title: 'Ammonia is high' },
] as const;

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-tight text-ink">{children}</h2>;

/** Guides, emergency steps and troubleshooting. Safe ranges come from the backend's own alert rules; nothing here is a hard-coded limit. */
export default async function HelpPage() {
  const t = await getT();
  const rules = await serverApi().riskRules().catch(() => null);
  const en = (key: string) => (hasOwn(t.lang, key) ? undefined : 'en');
  return (
    <>
      <PageHeader title={t('help.title')} description={t('help.description')} />
      <nav aria-label="On this page" className="mb-8 flex flex-wrap gap-2">
        {[['emergency', t('help.emergency')], ['troubleshoot', t('help.troubleshoot')], ['colours', t('help.colours')], ['measurements', t('help.measurements')]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className={linkButtonClass('secondary', 'sm')}>{label}</a>
        ))}
      </nav>

      <div className="space-y-12">
        <section aria-labelledby="emergency" className="space-y-4">
          <H2 id="emergency">{t('help.emergency')}</H2>
          <p className="flex items-start gap-2 rounded-xl border-2 border-crit-text/50 bg-crit-bg p-4 text-[17px] font-semibold text-crit-text" lang={en('care.actions.always')}>
            <WarningOctagon size={24} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />{t('care.actions.always')}
          </p>
          <div className="grid items-start gap-3">
            {EMERGENCIES.map((e) => (
              <details key={`${e.parameter}-${e.direction}`} className="group rounded-xl border border-line bg-card" open={e.parameter === 'dissolved_oxygen'}>
                <summary className="flex min-h-14 cursor-pointer items-center gap-2 px-4 text-[17px] font-semibold text-ink">{e.title}</summary>
                <div className="px-4 pb-4"><ActionSteps parameter={e.parameter} direction={e.direction} severity="CRITICAL" showAlways={false} headingLevel="h3" /></div>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="troubleshoot" className="space-y-4">
          <H2 id="troubleshoot">{t('help.troubleshoot')}</H2>
          <p className="text-[15px] text-ink-soft" lang={en('help.troubleshootIntro')}>{t('help.troubleshootIntro')}</p>
          <ol className="space-y-3">
            {([
              [WifiHigh, 'help.stepPhone', 'help.stepPhoneBody'],
              [CloudCheck, 'help.stepService', 'help.stepServiceBody'],
              [Cpu, 'help.stepDevice', 'help.stepDeviceBody'],
              [ArrowsClockwise, 'help.stepConfirm', 'help.stepConfirmBody'],
            ] as const).map(([Icon, title, body], i) => (
              <li key={title} className="flex gap-4 rounded-xl border border-line bg-card p-4">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-pale text-lg font-semibold text-brand-text">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink" lang={en(title)}><Icon size={20} aria-hidden="true" className="text-brand" />{t(title)}</h3>
                  <p className="mt-1 text-[15px] text-ink" lang={en(body)}>{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p><Link href="/health" className="font-medium text-brand-text underline underline-offset-2">{t('help.systemLink')}</Link></p>
        </section>

        <section aria-labelledby="colours" className="space-y-4">
          <H2 id="colours">{t('help.colours')}</H2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {([
              [CheckCircle, 'text-ok-text bg-ok-bg', t('care.verdict.healthy.title'), 'help.status.healthy'],
              [Warning, 'text-warn-text bg-warn-bg', t('care.verdict.attention.title'), 'help.status.warning'],
              [WarningOctagon, 'text-crit-text bg-crit-bg', t('care.verdict.urgent.title'), 'help.status.critical'],
              [Question, 'text-stale-text bg-stale-bg', t('care.verdict.unknown.title'), 'help.status.unknown'],
            ] as const).map(([Icon, cls, title, body]) => (
              <li key={body} className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${cls}`}><Icon size={26} weight="fill" aria-hidden="true" /></span>
                <div><p className="text-[17px] font-semibold text-ink">{title}</p><p className="text-[15px] text-ink" lang={en(body)}>{t(body)}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="measurements" className="space-y-4">
          <H2 id="measurements">{t('help.measurements')}</H2>
          <ul className="grid gap-4 md:grid-cols-2">
            {MEASURES.map((p) => {
              const Icon = PARAM_ICON[p];
              const rule = rules?.parameters?.[p];
              return (
                <li key={p} id={`measure-${p}`} className="scroll-mt-24 rounded-xl border border-line bg-card p-5">
                  <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink">{Icon ? <Icon size={22} aria-hidden="true" className="text-brand" /> : null}{t(`care.measure.${p}.name`)}</h3>
                  <p className="text-sm text-ink-soft">{t(`care.measure.${p}.term`)}</p>
                  <p className="mt-2 text-[15px] text-ink" lang={en(`care.measure.${p}.why`)}>{t(`care.measure.${p}.why`)}</p>
                  <p className="mt-2 text-sm text-ink-soft">
                    <span className="font-medium text-ink">{t('help.safeRange')}: </span>
                    {rule?.enabled ? <>{acceptableText(rule)}{rule.source === 'provisional_demo' ? ' (provisional)' : ''}</> : p === 'dissolved_oxygen' || p === 'ph' || p === 'temperature' ? t('help.safeRangeUnknown') : t('care.measure.noRule')}
                  </p>
                  {p === 'ammonia' || p === 'nitrite' || p === 'alkalinity' ? <p className="mt-1 text-sm text-ink-soft">{t('care.measure.notMeasured')}.</p> : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="ask" className="rounded-xl border border-line bg-brand-pale p-5">
          <h2 id="ask" className="text-lg font-semibold text-ink">{t('help.ask')}</h2>
          <p className="mt-1 text-[15px] text-ink" lang={en('help.askBody')}>{t('help.askBody')}</p>
          <Link href="/chat" className={`${linkButtonClass('primary')} mt-3`}><ChatCircleText size={18} aria-hidden="true" />{t('nav.ask')}</Link>
        </section>
      </div>
    </>
  );
}
