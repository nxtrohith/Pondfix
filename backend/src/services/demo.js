// Demo scenarios are explicit inputs that go through the SAME ingestion pipeline as real readings (source "simulated").
import { z } from 'zod';
import { parse, isoDateTime } from '../utils/params.js';
import { ingestMeasurement } from './ingestion.js';

export const SCENARIOS = Object.freeze({
  healthy: { dissolved_oxygen: 5.2, expected: 'NORMAL' },
  warning: { dissolved_oxygen: 2.7, expected: 'WARNING' },
  critical: { dissolved_oxygen: 1.8, expected: 'CRITICAL' },
});

const input = z.object({
  pondId: z.string(),
  scenario: z.enum(['healthy', 'warning', 'critical']).optional(),
  dissolvedOxygen: z.number().finite().optional(),
  recordedAt: isoDateTime.optional(),
}).strict().refine((d) => (d.scenario === undefined) !== (d.dissolvedOxygen === undefined), { message: 'provide exactly one of scenario or dissolvedOxygen' });

export async function demoMeasurement(deps, raw) {
  const d = parse(input, raw);
  const value = d.scenario ? SCENARIOS[d.scenario].dissolved_oxygen : d.dissolvedOxygen;
  return ingestMeasurement(deps, {
    pondId: d.pondId, source: 'simulated', recordedAt: d.recordedAt,
    values: [{ parameter: 'dissolved_oxygen', value, unit: 'mg/L' }],
  }, { extraMeta: { simulated: true, scenario: d.scenario ?? null, note: 'Explicit demo input, not a real pond reading.' } });
}
