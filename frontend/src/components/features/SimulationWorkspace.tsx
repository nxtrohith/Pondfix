'use client';
import { useState, type ReactNode } from 'react';
import type { RiskRules } from '@/lib/api/schemas';
import { Segmented } from '../ui/Field';
import { HistoricalReplay } from './HistoricalReplay';

type Mode = 'replay' | 'test';

/** Demo area: replay history or try test readings. Always labelled so it is never mistaken for live monitoring. */
export function SimulationWorkspace({ testReading, rules }: { testReading: ReactNode; rules: RiskRules | null }) {
  const [mode, setMode] = useState<Mode>('replay');
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-olive/60 bg-sage-pale px-4 py-3 text-[13px] text-olive-text" role="note">
        <span className="mr-2 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold tracking-wide">DEMO</span>
        This is not live monitoring. Replaying history only reads recorded data; test readings are saved as clearly marked simulations and never describe your real ponds.
      </div>
      <Segmented<Mode> label="Demo type" value={mode} onChange={setMode} options={[{ value: 'replay', label: 'Replay history' }, { value: 'test', label: 'Test an alert' }]} />
      {mode === 'replay' ? <HistoricalReplay rules={rules} /> : testReading}
    </div>
  );
}
