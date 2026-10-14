import { z } from 'zod';
import { validationError } from './errors.js';

export const PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature', 'water_level', 'ammonia', 'nitrate', 'turbidity', 'nitrite', 'alkalinity', 'salinity', 'un_ionized_ammonia'];
export const SOURCES = ['historical', 'simulated', 'live'];

/** Parse with zod and turn failures into a 422 with per-field details (no input echo of secrets). */
export function parse(schema, input) {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw validationError('request validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

const isoDate = z.string().trim().refine((s) => /^\d{4}-\d{2}-\d{2}(T|$)/.test(s) && !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 date/time');
// Date-times without an explicit zone are ambiguous, so they are refused rather than guessed.
export const isoDateTime = z.string().trim().refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)), 'must be ISO-8601 with a timezone, e.g. 2026-01-20T06:30:00Z');
export const queryDate = isoDate.transform((s) => new Date(s));
