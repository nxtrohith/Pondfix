'use client';
import { useState } from 'react';
import { AeratorIllustration, FISH_ACTIVITY_LABEL, FeedDispenserIllustration, FishStatusIllustration, FlowPipeIllustration, WaterLevelSensorIllustration, type FishActivity } from '../illustrations';
import { cx } from '../ui/cx';

/**
 * DEMO ONLY. The backend does not yet report aerator, flow, water-level status or fish detection, so these scenarios are made-up fixtures
 * that exercise the illustration components. Shown only on request (?demo=equipment) and always labelled as demo data.
 */
interface Scenario { label: string; aerator: 'running' | 'stopped' | 'unknown'; inlet: boolean; outlet: boolean; lowWater: boolean; fish: Record<FishActivity, number> }
const SCENARIOS: Record<string, Scenario> = {
  healthy: { label: 'Healthy pond', aerator: 'running', inlet: true, outlet: true, lowWater: false, fish: { normal: 46, low: 2, distressed: 0, motionless: 0 } },
  lowOxygen: { label: 'Low oxygen', aerator: 'stopped', inlet: false, outlet: true, lowWater: false, fish: { normal: 18, low: 15, distressed: 11, motionless: 1 } },
  lowWater: { label: 'Low water', aerator: 'running', inlet: false, outlet: false, lowWater: true, fish: { normal: 30, low: 9, distressed: 2, motionless: 0 } },
  noData: { label: 'No equipment data', aerator: 'unknown', inlet: false, outlet: false, lowWater: false, fish: { normal: 0, low: 0, distressed: 0, motionless: 0 } },
};
const ORDER: FishActivity[] = ['normal', 'low', 'distressed', 'motionless'];
const NOTE: Partial<Record<FishActivity, string>> = { motionless: 'Not necessarily dead: check the fish before acting.' };

export function EquipmentDemoPanel() {
  const [key, setKey] = useState<keyof typeof SCENARIOS>('healthy');
  const s = SCENARIOS[key]!;
  const total = ORDER.reduce((n, a) => n + s.fish[a], 0);
  const stateText = (on: boolean, yes: string, no: string) => (on ? yes : no);
  return (
    <section aria-labelledby="equip-demo" className="space-y-3 rounded-xl border border-dashed border-warn-text/50 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="equip-demo" className="flex items-center gap-2 text-lg font-medium tracking-tight text-ink">Equipment and fish status <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-text">Demo data</span></h2>
          <p className="mt-0.5 text-sm text-ink-soft">Made-up values to preview the pictures. Not read from this pond; no equipment or fish detection is connected yet.</p>
        </div>
        <div role="group" aria-label="Demo scenario" className="flex flex-wrap gap-1.5">
          {Object.entries(SCENARIOS).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={k === key} onClick={() => setKey(k)} className={cx('h-8 rounded-lg border px-3 text-sm', k === key ? 'border-brand bg-brand-pale font-medium text-brand-text' : 'border-line bg-card text-ink hover:bg-surface')}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <figure className="rounded-lg bg-surface p-3 text-center">
          <AeratorIllustration state={s.aerator} size={112} className="mx-auto" />
          <figcaption className="text-sm font-medium text-ink">Aerator</figcaption>
          <p className="text-xs text-ink-soft">{s.aerator === 'running' ? 'Running' : s.aerator === 'stopped' ? 'Stopped' : 'State unknown'}</p>
        </figure>
        <figure className="rounded-lg bg-surface p-3 text-center">
          <FlowPipeIllustration kind="inlet" flowing={s.inlet} size={112} className="mx-auto" />
          <figcaption className="text-sm font-medium text-ink">Inlet</figcaption>
          <p className="text-xs text-ink-soft">{stateText(s.inlet, 'Water flowing in', 'No flow')}</p>
        </figure>
        <figure className="rounded-lg bg-surface p-3 text-center">
          <FlowPipeIllustration kind="outlet" flowing={s.outlet} size={112} className="mx-auto" />
          <figcaption className="text-sm font-medium text-ink">Outlet</figcaption>
          <p className="text-xs text-ink-soft">{stateText(s.outlet, 'Water flowing out', 'No flow')}</p>
        </figure>
        <figure className={cx('rounded-lg p-3 text-center', s.lowWater ? 'bg-crit-bg ring-1 ring-crit-text/30' : 'bg-surface')}>
          <WaterLevelSensorIllustration low={s.lowWater} size={112} className="mx-auto" />
          <figcaption className="text-sm font-medium text-ink">Water level</figcaption>
          <p className={cx('text-xs', s.lowWater ? 'font-semibold text-crit-text' : 'text-ink-soft')}>{s.lowWater ? 'Critical: water level is low' : 'Normal'}</p>
        </figure>
        <figure className="rounded-lg bg-surface p-3 text-center">
          <FeedDispenserIllustration size={112} className="mx-auto" />
          <figcaption className="text-sm font-medium text-ink">Feed dispenser</figcaption>
          <p className="text-xs text-ink-soft">Idle</p>
        </figure>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">Fish activity <span className="font-normal text-ink-soft">({total} detected)</span></h3>
        {total === 0 ? <p className="mt-1 text-sm text-ink-soft">No detection results available.</p> : (
          <ul className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ORDER.map((a) => (
              <li key={a} className={cx('flex items-center gap-3 rounded-lg p-3', a === 'distressed' && s.fish[a] > 0 ? 'bg-crit-bg ring-1 ring-crit-text/30' : 'bg-surface')}>
                <FishStatusIllustration activity={a} size={80} className="-my-3 -ml-2" />
                <div className="min-w-0">
                  <p className="text-2xl font-medium tabular-nums leading-none text-ink">{s.fish[a]}</p>
                  <p className="mt-1 text-sm text-ink">{FISH_ACTIVITY_LABEL[a]}</p>
                  {NOTE[a] ? <p className="text-xs text-ink-soft">{NOTE[a]}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
