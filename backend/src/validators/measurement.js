import { z } from 'zod';
import { isoDateTime, PARAMETERS } from '../utils/params.js';

// Canonical unit per parameter (as stored). A few common spellings are accepted and normalised; anything else is rejected.
const UNITS = {
  dissolved_oxygen: { canonical: 'mg/L', aliases: ['mg/l'] },
  ph: { canonical: 'pH', aliases: ['ph', 'ph units', 'pH units'] },
  temperature: { canonical: 'C', aliases: ['°C', 'c', 'celsius'] },
  water_level: { canonical: 'm', aliases: ['meter', 'meters', 'metre', 'metres'] },
};
// Physically impossible bounds only (same as the database validator). Preferred operating ranges are risk rules, not validation.
export const BOUNDS = { dissolved_oxygen: [0, 50], ph: [0, 14], temperature: [-5, 60], water_level: [0, 50] };

const value = z.object({
  parameter: z.enum(PARAMETERS),
  value: z.number({ invalid_type_error: 'value must be a number' }).finite(),
  unit: z.string().trim().min(1).optional(),
}).strict().superRefine((v, ctx) => {
  const [lo, hi] = BOUNDS[v.parameter];
  if (v.value < lo || v.value > hi) ctx.addIssue({ code: 'custom', path: ['value'], message: `${v.parameter} must be between ${lo} and ${hi} ${UNITS[v.parameter].canonical}` });
  if (v.unit !== undefined) {
    const u = UNITS[v.parameter];
    if (v.unit !== u.canonical && !u.aliases.includes(v.unit)) ctx.addIssue({ code: 'custom', path: ['unit'], message: `unit for ${v.parameter} must be ${u.canonical}` });
  }
}).transform((v) => ({ parameter: v.parameter, value: v.value, unit: UNITS[v.parameter].canonical }));

export const measurementInput = z.object({
  pondId: z.string(),
  recordedAt: isoDateTime.optional(),
  source: z.enum(['live', 'simulated']).default('live'),
  values: z.array(value).min(1).max(4),
  idempotencyKey: z.string().trim().min(1).max(100).regex(/^[\w.:-]+$/, 'letters, digits and . _ : - only').optional(),
}).strict().superRefine((m, ctx) => {
  const seen = new Set();
  m.values.forEach((v, i) => { if (seen.has(v.parameter)) ctx.addIssue({ code: 'custom', path: ['values', i, 'parameter'], message: 'duplicate parameter' }); seen.add(v.parameter); });
});
