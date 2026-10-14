// "What if" playground: given hypothetical conditions, what would AquaGuard classify and what would it tell the farmer to watch for?
// Pure computation: reads the active risk rules and the same coupling rules the advisor uses, and writes nothing (no measurement, alert or
// prediction is created). Everything it returns is hypothetical and is labelled as such.
import { z } from 'zod';
import { parse } from '../utils/params.js';
import { RULE_PARAMETERS, PARAMETER_LABEL, classify } from './risk.js';
import { downstreamRisks, unionizedFraction } from './ai/couplings.js';

const TREND = z.enum(['rising', 'steady', 'falling']);
const num = (lo, hi) => z.number().finite().min(lo).max(hi);
const schema = z.object({
  temperature: num(-5, 60).optional(), temperatureTrend: TREND.default('steady'),
  dissolvedOxygen: num(0, 50).optional(), dissolvedOxygenTrend: TREND.default('steady'),
  ph: num(0, 14).optional(), phTrend: TREND.default('steady'),
  ammonia: num(0, 20).optional(), nitrite: num(0, 20).optional(), alkalinity: num(0, 500).optional(), salinity: num(0, 50).optional(),
  hourIst: z.number().int().min(0).max(23).default(15),
}).strict();

/** A Date whose clock reads `hour` o'clock in IST (the zone the feeding and daylight rules use). */
const atIstHour = (hour) => new Date(Date.UTC(2026, 0, 1) + (((hour - 5.5) % 24) + 24) % 24 * 3600000);

export function whatIf(body) {
  const q = parse(schema, body ?? {});
  const parameters = {};
  const put = (p, value, trend) => { if (value !== undefined) parameters[p] = { value, trend, minutesSinceReading: 0 }; };
  put('temperature', q.temperature, q.temperatureTrend);
  put('dissolved_oxygen', q.dissolvedOxygen, q.dissolvedOxygenTrend);
  put('ph', q.ph, q.phTrend);

  // Status as the active general rules would classify each value (species-specific rules are not applied to a hypothetical pond).
  const status = Object.fromEntries(RULE_PARAMETERS.filter((p) => parameters[p]).map((p) => {
    const c = classify(p, parameters[p].value);
    return [p, { label: PARAMETER_LABEL[p], value: parameters[p].value, status: c.status, ...(c.direction ? { direction: c.direction, threshold: c.threshold } : {}) }];
  }));

  const otherReadings = {};
  for (const [p, v] of [['ammonia', q.ammonia], ['nitrite', q.nitrite], ['alkalinity', q.alkalinity], ['salinity', q.salinity]]) if (v !== undefined) otherReadings[p] = { value: v };
  const derived = {};
  if (q.ph !== undefined && q.temperature !== undefined) {
    const f = unionizedFraction(q.ph, q.temperature);
    derived.unionizedFractionPercent = Math.round(f * 1000) / 10;
    if (q.ammonia !== undefined) { derived.unIonizedAmmonia = Math.round(q.ammonia * f * 10000) / 10000; otherReadings.un_ionized_ammonia = { value: derived.unIonizedAmmonia }; }
  }

  return { hypothetical: true, hourIst: q.hourIst, status, derived, risks: downstreamRisks({ parameters, otherReadings, at: atIstHour(q.hourIst) }),
    note: 'Hypothetical values only. Nothing was saved and no alert was created.' };
}
