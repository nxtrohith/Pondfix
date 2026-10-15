// Deterministic policy around the model outputs. Numbers, ordering floors and safety gates live here in code; Jev and the LLM only supply
// semantic judgements that this code then bounds. Nothing in this file (or its callers) decides whether an alert exists.
import { z } from 'zod';
import { RANK } from '../risk.js';

export const THRESHOLDS = Object.freeze({
  minConfidence: 0.5,      // Jev score/choice answers below this confidence are ignored (rule-based order is used instead)
  sensorFault: 0.7,        // P(sensor malfunction) at or above this flags the alert; it never suppresses it
  sameCause: 0.7,          // P(same underlying cause) at or above this groups alerts into one incident
  forecastActionable: 0.5,
  guardClaimsSafe: 0.5, guardDosing: 0.5, guardPriority: 0.7,
});

/** How far past its warning limit a value is, as a fraction of the warning->critical band: 0 inside the range, 1 at the critical limit, >1 beyond it. */
export function exceedance(rule, value, direction) {
  if (!rule || !Number.isFinite(value)) return 0;
  const [warn, crit, sign] = direction === 'high' ? [rule.high_warn, rule.high_crit, 1] : [rule.low_warn, rule.low_crit, -1];
  if (warn === undefined || crit === undefined) return 0;
  const x = sign * (value - warn) / Math.abs(crit - warn);
  return x > 0 ? Math.round(x * 100) / 100 : 0;
}

const TOLERANCE = { dissolved_oxygen: 0.3, ph: 0.2, temperature: 1, ammonia: 0.1 };
/** 'rising' | 'falling' | 'steady' | null from oldest->newest values; null with fewer than 3 points. */
export function trendOf(parameter, values) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const d = values.at(-1) - values[0]; const tol = TOLERANCE[parameter] ?? 0.1 * Math.abs(values[0] || 1);
  return Math.abs(d) <= tol ? 'steady' : d > 0 ? 'rising' : 'falling';
}

/**
 * Orders abnormal parameters, most urgent first. Safety floor: a CRITICAL parameter is never ranked below a WARNING one, whatever Jev said.
 * Within the same status Jev's urgency score decides when it is confident; otherwise (or on ties) the exceedance computed in code does.
 * items: [{ parameter, status, exceedance, jev?: { score, confidence } }]
 */
export function rankPriorities(items) {
  const urgency = (i) => (i.jev && i.jev.confidence >= THRESHOLDS.minConfidence ? i.jev.score : 0);
  return [...items].sort((a, b) => (RANK[b.status] - RANK[a.status]) || (urgency(b) - urgency(a)) || (b.exceedance - a.exceedance) || a.parameter.localeCompare(b.parameter));
}

const CHANNELS = ['in_app', 'push', 'sms'];
/**
 * Recommended delivery channel (a recommendation only: this service sends nothing). Floors/caps: an observed CRITICAL alert is at least
 * 'push'; a WARNING that looks like a sensor fault is at most 'push', so a glitch does not text anyone at night.
 * jevScore is Jev's 0..2 urgency score (or null when missing/low confidence).
 */
export function chooseChannel({ severity, origin, jevScore, sensorSuspect }) {
  let i = jevScore === null || jevScore === undefined ? (severity === 'CRITICAL' ? 2 : 1) : jevScore < 0.75 ? 0 : jevScore < 1.5 ? 1 : 2;
  const reasons = [];
  if (severity === 'CRITICAL' && origin === 'observed' && i < 1) { i = 1; reasons.push('observed critical alerts are never in-app only'); }
  if (origin === 'predicted' && i > 1) { i = 1; reasons.push('forecast alerts are capped at push'); }
  if (severity === 'WARNING' && sensorSuspect && i > 1) { i = 1; reasons.push('possible sensor fault: capped at push'); }
  return { channel: CHANNELS[i], reasons };
}

// ---- LLM solution: parse + guard ----
export const DEFAULT_VERIFY_FIRST = 'Check the reading against a second meter or test kit.';
// Lenient on harmless things (extra keys are dropped; an empty or missing verifyFirst gets the standard check), strict on what matters:
// a summary and at least one step must exist, and every string is length-bounded.
const text = (max) => z.string().trim().min(1).max(max);
const solutionSchema = z.object({
  // Telugu takes more characters than English for the same meaning, so the bounds leave room for a detailed reply.
  summary: text(1500),
  verifyFirst: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v : DEFAULT_VERIFY_FIRST), text(600)),
  steps: z.array(text(600)).min(1).max(8),
});

/** Extracts and validates the JSON the LLM was asked for. -> { ok: true, solution } | { ok: false, reason } (the reason names the failing field). */
export function checkSolution(raw) {
  // Reasoning models may prefix a <think>...</think> block that can itself contain braces.
  const m = /\{[\s\S]*\}/.exec(String(raw).replace(/<think>[\s\S]*?<\/think>/gi, ''));
  if (!m) return { ok: false, reason: 'no JSON object in the reply' };
  let json; try { json = JSON.parse(m[0]); } catch { return { ok: false, reason: 'the reply is not valid JSON' }; }
  const r = solutionSchema.safeParse(json);
  if (r.success) return { ok: true, solution: r.data };
  return { ok: false, reason: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'reply'}: ${i.message}`).join('; ') };
}
export const parseSolution = (raw) => { const r = checkSolution(raw); return r.ok ? r.solution : null; };

/** Jev guard answers (noul probabilities, null = missing) -> { passed, reasons }. A missing answer fails closed. */
export function guardVerdict({ claimsSafe, dosing, contradictsPriority }) {
  const reasons = [];
  if (claimsSafe === null || dosing === null || contradictsPriority === null) reasons.push('guard check unavailable');
  if (claimsSafe >= THRESHOLDS.guardClaimsSafe) reasons.push('advice implies the pond is safe');
  if (dosing >= THRESHOLDS.guardDosing) reasons.push('advice gives unsourced doses or products');
  if (contradictsPriority >= THRESHOLDS.guardPriority) reasons.push('advice contradicts the computed priority');
  return { passed: reasons.length === 0, reasons };
}
