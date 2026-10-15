'use client';
import { useState, type ReactNode } from 'react';
import type { RiskRules } from '@/lib/api/schemas';
import { Segmented } from '../ui/Field';
import { HistoricalReplay } from './HistoricalReplay';
import { WhatIfPlayground } from './WhatIfPlayground';

type Mode = 'replay' | 'test' | 'whatif';

/** Demo area: replay history or try test readings. Always labelled so it is never mistaken for live monitoring. */
export function SimulationWorkspace({ testReading, rules }: { testReading: ReactNode; rules: RiskRules | null }) {
  const [mode, setMode] = useState<Mode>('replay');
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-brand/60 bg-brand-pale px-4 py-3 text-sm text-brand-text" role="note">
        <span className="mr-2 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold tracking-wide">DEMO</span>
        This is not live monitoring. Replaying history only reads recorded data. “What if…” only works things out and saves nothing. A test reading is saved to the pond you choose and labelled “Test data” wherever it appears, so you can tell it apart from real readings.
      </div>
      <Segmented<Mode> label="Demo type" value={mode} onChange={setMode} options={[{ value: 'replay', label: 'Replay history' }, { value: 'test', label: 'Test an alert' }, { value: 'whatif', label: 'What if…' }]} />
      {mode === 'replay' ? <HistoricalReplay rules={rules} /> : mode === 'whatif' ? <WhatIfPlayground /> : testReading}
    </div>
  );
}
