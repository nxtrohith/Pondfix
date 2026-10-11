// Demo scenarios are explicit inputs that go through the SAME ingestion pipeline as real readings (source "simulated").
import { z } from 'zod';
import { parse, isoDateTime } from '../utils/params.js';
import { ingestMeasurement } from './ingestion.js';

export const SCENARIOS = Object.freeze({
  healthy: { dissolved_oxygen: 5.2, expected: 'NORMAL' },
  warning: { dissolved_oxygen: 2.7, expected: 'WARNING' },
  critical: { dissolved_oxygen: 1.8, expected: 'CRITICAL' },
});

// One simulated reading may carry dissolved oxygen (via a scenario OR a number), pH and temperature. Ranges and units are
// enforced by the shared measurement validator inside ingestMeasurement; pH and temperature have no validated risk rules.
const input = z.object({
  pondId: z.string(),
  scenario: z.enum(['healthy', 'warning', 'critical']).optional(),
  dissolvedOxygen: z.number().finite().optional(),
  ph: z.number().finite().optional(),
  temperature: z.number().finite().optional(),
  recordedAt: isoDateTime.optional(),
}).strict()
  .refine((d) => d.scenario === undefined || d.dissolvedOxygen === undefined, { message: 'provide at most one of scenario or dissolvedOxygen' })
  .refine((d) => [d.scenario, d.dissolvedOxygen, d.ph, d.temperature].some((v) => v !== undefined), { message: 'provide at least one value: scenario, dissolvedOxygen, ph or temperature' });

export async function demoMeasurement(deps, raw) {
  const d = parse(input, raw);
  const doValue = d.scenario ? SCENARIOS[d.scenario].dissolved_oxygen : d.dissolvedOxygen;
  const values = [];
  if (doValue !== undefined) values.push({ parameter: 'dissolved_oxygen', value: doValue, unit: 'mg/L' });
  if (d.ph !== undefined) values.push({ parameter: 'ph', value: d.ph, unit: 'pH' });
  if (d.temperature !== undefined) values.push({ parameter: 'temperature', value: d.temperature, unit: 'C' });
  return ingestMeasurement(deps, { pondId: d.pondId, source: 'simulated', recordedAt: d.recordedAt, values }, { extraMeta: { simulated: true, scenario: d.scenario ?? null, note: 'Explicit demo input, not a real pond reading.' } });
}
