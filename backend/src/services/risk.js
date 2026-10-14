// Risk classification. The ONLY place thresholds live on the backend.
//
// Rule shape (same key names as ml/aquaguard_config.py, so one optional JSON file configures both sides):
//   low_warn / low_crit   : value <  low_warn -> WARNING ; value <  low_crit -> CRITICAL   (low_crit < low_warn)
//   high_warn / high_crit : value >  high_warn -> WARNING ; value >  high_crit -> CRITICAL (high_crit > high_warn)
// All comparisons are strict, so a value exactly ON a limit is never an excursion: the acceptable range [low_warn, high_warn]
// is inclusive, and a value exactly on a critical limit is WARNING (as dissolved oxygen always was: 3.0 NORMAL, 2.0 WARNING).
//
// Defaults:
//   dissolved oxygen (mg/L) : low_warn 3.0, low_crit 2.0                 -- project default, unchanged
//   pH                      : acceptable 6.5-8.5, critical < 6.0 / > 9.0  -- PROVISIONAL DEMO values
//   temperature (C)         : acceptable 20-32, critical < 15 / > 35      -- PROVISIONAL DEMO values
// None of these are validated species-specific safety limits. Validate them before any real farm deployment, and change them
// with the optional AQUAGUARD_THRESHOLDS JSON file (e.g. {"ph":{"low_warn":6.8,"low_crit":6.3,"high_warn":8.2,"high_crit":8.8}},
// keys do|ph|temp), never by editing numbers elsewhere. Invalid configuration stops startup; it never silently disables alerts.
// A rule can be switched off explicitly with RISK_RULES_DISABLED=ph,temperature (a disabled parameter classifies as UNKNOWN).
import fs from 'node:fs';
import path from 'node:path';

export const UNITS = Object.freeze({ dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' });
export const RULE_PARAMETERS = Object.freeze(Object.keys(UNITS));
export const PARAMETER_LABEL = Object.freeze({ dissolved_oxygen: 'Dissolved oxygen', ph: 'pH', temperature: 'Water temperature' });
const DECIMALS = { dissolved_oxygen: 2, ph: 2, temperature: 1 };
const FILE_KEYS = { do: 'dissolved_oxygen', ph: 'ph', temp: 'temperature' };
const LIMIT_KEYS = ['low_warn', 'low_crit', 'high_warn', 'high_crit'];
// Physically possible values (same as the measurement validator); limits outside them could never fire.
const PHYSICAL = { dissolved_oxygen: [0, 50], ph: [0, 14], temperature: [-5, 60] };

export const RULES_VERSION = 'demo-defaults-2026-10';
export const DEFAULT_LIMITS = Object.freeze({
  dissolved_oxygen: Object.freeze({ low_warn: 3.0, low_crit: 2.0 }),
  ph: Object.freeze({ low_warn: 6.5, low_crit: 6.0, high_warn: 8.5, high_crit: 9.0 }),
  temperature: Object.freeze({ low_warn: 20, low_crit: 15, high_warn: 32, high_crit: 35 }),
});
const DEFAULT_SOURCE = { dissolved_oxygen: 'project_default', ph: 'provisional_demo', temperature: 'provisional_demo' };

export class RuleConfigError extends Error {
  constructor(problems) { super(`invalid risk-rule configuration: ${problems.join('; ')}`); this.name = 'RuleConfigError'; this.problems = problems; }
}

/** Returns a list of problems (empty when valid). `limits` = { parameter: { low_warn?, ..., unit?, enabled? } }. */
export function validateRules(limits) {
  const problems = [];
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return ['rules must be an object keyed by parameter'];
  for (const [p, r] of Object.entries(limits)) {
    if (!UNITS[p]) { problems.push(`${p}: unsupported parameter (supported: ${RULE_PARAMETERS.join(', ')})`); continue; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { problems.push(`${p}: rule must be an object`); continue; }
    for (const k of Object.keys(r)) if (![...LIMIT_KEYS, 'unit', 'enabled'].includes(k)) problems.push(`${p}: unknown key ${JSON.stringify(k)}`);
    if (r.unit !== undefined && r.unit !== UNITS[p]) problems.push(`${p}: unsupported unit ${JSON.stringify(r.unit)} (must be ${UNITS[p]})`);
    if (r.enabled !== undefined && typeof r.enabled !== 'boolean') problems.push(`${p}: enabled must be true or false`);
    let finite = true;
    for (const k of LIMIT_KEYS) {
      if (r[k] === undefined) continue;
      if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) { problems.push(`${p}.${k} must be a finite number`); finite = false; }
      else if (r[k] < PHYSICAL[p][0] || r[k] > PHYSICAL[p][1]) { problems.push(`${p}.${k} (${r[k]}) is outside the physically possible range ${PHYSICAL[p][0]} to ${PHYSICAL[p][1]}`); finite = false; }
    }
    const low = ['low_warn', 'low_crit'].filter((k) => r[k] !== undefined); const high = ['high_warn', 'high_crit'].filter((k) => r[k] !== undefined);
    if (low.length === 1) problems.push(`${p}: lower side needs both low_warn and low_crit`);
    if (high.length === 1) problems.push(`${p}: upper side needs both high_warn and high_crit`);
    if (!low.length && !high.length) problems.push(`${p}: define at least one side (low_warn/low_crit or high_warn/high_crit)`);
    if (!finite) continue;
    if (low.length === 2 && !(r.low_crit < r.low_warn)) problems.push(`${p}: low_crit (${r.low_crit}) must be < low_warn (${r.low_warn})`);
    if (high.length === 2 && !(r.high_crit > r.high_warn)) problems.push(`${p}: high_crit (${r.high_crit}) must be > high_warn (${r.high_warn})`);
    if (low.length === 2 && high.length === 2 && !(r.low_warn < r.high_warn)) problems.push(`${p}: low_warn (${r.low_warn}) must be < high_warn (${r.high_warn}) or the acceptable range is empty`);
  }
  return problems;
}

/** Builds the active rule set from defaults, the optional AQUAGUARD_THRESHOLDS file and RISK_RULES_DISABLED. Throws RuleConfigError. */
export function loadRiskRules(env = process.env) {
  const limits = Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([p, l]) => [p, { ...l }]));
  const source = { ...DEFAULT_SOURCE };
  const problems = [];
  let version = RULES_VERSION; let mode = 'provisional_demo';
  const file = env.AQUAGUARD_THRESHOLDS;
  if (file) {
    let loaded = null;
    try { loaded = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`AQUAGUARD_THRESHOLDS cannot be read as JSON (${e.code || e.name})`); }
    if (loaded !== null) {
      if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) problems.push('AQUAGUARD_THRESHOLDS must hold {parameter: {limit: number}}');
      else for (const [k, v] of Object.entries(loaded)) {
        const p = FILE_KEYS[k];
        if (!p) { problems.push(`AQUAGUARD_THRESHOLDS: unsupported parameter ${JSON.stringify(k)} (use do, ph or temp)`); continue; }
        limits[p] = v; source[p] = 'configured';
      }
      version = `file:${path.basename(file)}`; mode = 'configured';
    }
  }
  const disabled = new Set((env.RISK_RULES_DISABLED || '').split(',').map((s) => s.trim()).filter(Boolean));
  for (const d of disabled) if (!UNITS[d]) problems.push(`RISK_RULES_DISABLED: unsupported parameter ${JSON.stringify(d)}`);
  problems.push(...validateRules(limits));
  if (problems.length) throw new RuleConfigError(problems);
  const rules = Object.fromEntries(RULE_PARAMETERS.map((p) => [p, Object.freeze({ ...limits[p], unit: UNITS[p], enabled: !disabled.has(p), source: source[p] })]));
  return Object.freeze({ version, mode, rules: Object.freeze(rules) });
}

let active = loadRiskRules({});
export const getActiveRules = () => active;
export const setActiveRules = (ruleset) => { active = ruleset; };
/** Back-compat view of the active limits (dissolved oxygen keys are unchanged). */
export const THRESHOLDS = new Proxy({}, { get: (_, p) => active.rules[p], has: (_, p) => p in active.rules, ownKeys: () => Object.keys(active.rules), getOwnPropertyDescriptor: (_, p) => (p in active.rules ? { enumerable: true, configurable: true, value: active.rules[p] } : undefined) });
export const RANK = Object.freeze({ UNKNOWN: 0, NORMAL: 1, WARNING: 2, CRITICAL: 3 });

/** Sides ('low' / 'high') an active rule can fire on. */
export const sidesOf = (parameter) => { const r = active.rules[parameter]; return r ? ['low', 'high'].filter((s) => r[`${s}_warn`] !== undefined) : []; };

/**
 * -> { status, threshold, unit, direction?, rule, reason? }. UNKNOWN (never "healthy") when there is no enabled rule or the value
 * is missing, null, NaN or infinite. `direction` is 'low' or 'high' for WARNING/CRITICAL; `threshold` is the limit that was crossed.
 */
export function classify(parameter, value) {
  const th = active.rules[parameter];
  if (!th) return { status: 'UNKNOWN', threshold: null, reason: 'no validated threshold configured for this parameter' };
  if (!th.enabled) return { status: 'UNKNOWN', threshold: null, reason: 'rule is disabled' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'UNKNOWN', threshold: null, reason: 'missing or non-numeric value' };
  const hit = (status, direction, key, op) => ({ status, direction, threshold: th[key], unit: th.unit, rule: `value ${op} ${th[key]}` });
  if (th.low_crit !== undefined && value < th.low_crit) return hit('CRITICAL', 'low', 'low_crit', '<');
  if (th.high_crit !== undefined && value > th.high_crit) return hit('CRITICAL', 'high', 'high_crit', '>');
  if (th.low_warn !== undefined && value < th.low_warn) return hit('WARNING', 'low', 'low_warn', '<');
  if (th.high_warn !== undefined && value > th.high_warn) return hit('WARNING', 'high', 'high_warn', '>');
  return { status: 'NORMAL', threshold: null, unit: th.unit, rule: 'within the acceptable range' };
}

/** Human-readable message built from the actual value and the active rule, e.g. "pH observed at 8.80; configured upper warning limit 8.50." */
export function observedMessage(parameter, value, cls) {
  const d = DECIMALS[parameter] ?? 2; const unit = UNITS[parameter];
  const u = unit === 'C' ? '°C' : unit === 'pH' ? '' : ` ${unit}`;
  const sev = cls.status === 'CRITICAL' ? 'critical' : 'warning';
  const limit = parameter === 'dissolved_oxygen' ? `${sev} threshold` : `configured ${cls.direction === 'high' ? 'upper' : 'lower'} ${sev} limit`;
  return `${PARAMETER_LABEL[parameter] ?? parameter} observed at ${value.toFixed(d)}${u}; ${limit} ${cls.threshold.toFixed(d)}${u}.`;
}

export const worst = (statuses) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'UNKNOWN');

/** Fresh/stale state for a reading. Stale or absent data is never reported as healthy. */
export function dataState(recordedAt, now, staleAfterMinutes) {
  if (!recordedAt) return { state: 'NO_DATA', ageMinutes: null };
  const ageMinutes = (now - recordedAt) / 60000;
  return { state: ageMinutes > staleAfterMinutes ? 'STALE' : 'FRESH', ageMinutes: Math.max(0, Math.round(ageMinutes * 10) / 10) };
}

/** Risk status from one parameter's latest reading: CRITICAL|WARNING|NORMAL|STALE|NO_DATA|UNKNOWN. Defaults to dissolved oxygen. */
export function pondRiskStatus(latest, now, staleAfterMinutes, parameter = 'dissolved_oxygen') {
  if (!latest) return 'NO_DATA';
  if (dataState(latest.recordedAt, now, staleAfterMinutes).state === 'STALE') return 'STALE';
  return classify(parameter, latest.value).status;
}

/**
 * Pond status over every parameter that has an enabled rule. Any FRESH critical/warning excursion wins, so a warning is never hidden
 * by a stale or healthy value elsewhere. With no excursion, dissolved oxygen stays the primary freshness signal (NORMAL, or STALE when
 * its last reading is old, so a fresh pH never masks stale oxygen data); a pond with no DO reading at all falls back to the others.
 */
export function pondOverallStatus(latestByParameter, now, staleAfterMinutes) {
  const ruled = RULE_PARAMETERS.filter((p) => active.rules[p].enabled && latestByParameter?.[p]);
  if (!ruled.length) return 'NO_DATA';
  const per = Object.fromEntries(ruled.map((p) => [p, pondRiskStatus(latestByParameter[p], now, staleAfterMinutes, p)]));
  const all = Object.values(per);
  if (all.includes('CRITICAL')) return 'CRITICAL';
  if (all.includes('WARNING')) return 'WARNING';
  if (per.dissolved_oxygen) return per.dissolved_oxygen;
  return all.includes('NORMAL') ? 'NORMAL' : 'STALE';
}
