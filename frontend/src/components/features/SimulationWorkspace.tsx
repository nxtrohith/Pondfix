'use client';
import { useState, type ReactNode } from 'react';
import type { RiskRules } from '@/lib/api/schemas';
import { Segmented } from '../ui/Field';
import { HistoricalReplay } from './HistoricalReplay';

type Mode = 'replay' | 'test';

/** Mode switch for the Simulation page. `testReading` is the existing simulated-reading UI, unchanged. */
export function SimulationWorkspace({ testReading, rules }: { testReading: ReactNode; rules: RiskRules | null }) {
  const [mode, setMode] = useState<Mode>('replay');
  return (
    <div className="space-y-6">
      <Segmented<Mode> label="Simulation mode" value={mode} onChange={setMode} options={[{ value: 'replay', label: 'Historical replay' }, { value: 'test', label: 'Test reading' }]} />
      {mode === 'replay' ? <HistoricalReplay rules={rules} /> : testReading}
    </div>
  );
}
