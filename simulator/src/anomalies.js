// Optional stress layer for demos (npm run simulator:anom): pushes some ponds into warning and critical ranges so alerts fire.
// It only rewrites the generated values for a time slot, so it is deterministic per pond and slot, and the base generator is untouched.
// About half of the ponds get one recurring problem each: every PERIOD_H hours a ramp of WINDOW_H hours rises from normal to a critical
// reading (warning on the way up and down) and falls back. Targets follow the default risk rules in backend/src/services/risk.js.
import { createHash } from 'node:crypto';

const PERIOD_H = 6;
const WINDOW_H = 2;
const KINDS = {
  low_oxygen: { parameter: 'dissolved_oxygen', target: 1.4 },   // warn < 3.0, critical < 2.0
  high_temperature: { parameter: 'temperature', target: 36.5 }, // warn > 32, critical > 35
  low_ph: { parameter: 'ph', target: 5.7 },                     // warn < 6.5, critical < 6.0
  high_ph: { parameter: 'ph', target: 9.3 },                    // warn > 8.5, critical > 9.0
};
const KIND_NAMES = Object.keys(KINDS);

/** The problem this pond is prone to, or null for a pond that stays healthy. */
export function anomalyPlan(seedText) {
  const h = createHash('sha1').update(`anomaly:${seedText}`).digest();
  if (h[0] % 2) return null;
  return { kind: KIND_NAMES[h[1] % KIND_NAMES.length], offsetH: h[2] % PERIOD_H };
}

/** 0 outside an episode, rising to 1 at its midpoint and back to 0. */
export function anomalyIntensity(plan, slotMs) {
  const hours = slotMs / 3600000 + plan.offsetH;
  const inPeriod = ((hours % PERIOD_H) + PERIOD_H) % PERIOD_H;
  const start = PERIOD_H - WINDOW_H;
  if (inPeriod < start) return 0;
  const x = (inPeriod - start) / WINDOW_H;
  return 1 - Math.abs(2 * x - 1);
}

/** Returns the values for this slot, bent toward the pond's problem when an episode is under way. */
export function applyAnomaly(plan, slotMs, values) {
  if (!plan) return values;
  const i = anomalyIntensity(plan, slotMs);
  if (i <= 0) return values;
  const { parameter, target } = KINDS[plan.kind];
  return values.map((v) => (v.parameter === parameter ? { ...v, value: Number((v.value + (target - v.value) * i).toFixed(2)) } : v));
}
