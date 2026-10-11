// Risk classification. The ONLY place thresholds live on the backend.
// Dissolved-oxygen rules are the project's established defaults (ml/aquaguard_config.py; a test keeps both in sync):
//   value <  2.0 -> CRITICAL ; 2.0 <= value < 3.0 -> WARNING ; value >= 3.0 -> NORMAL
// They are project defaults, not validated species-specific safety limits.
// pH, temperature and water level have NO validated rules, so they classify as UNKNOWN (never "healthy").
export const THRESHOLDS = Object.freeze({
  dissolved_oxygen: Object.freeze({ unit: 'mg/L', low_warn: 3.0, low_crit: 2.0 }),
});
export const RANK = Object.freeze({ UNKNOWN: 0, NORMAL: 1, WARNING: 2, CRITICAL: 3 });

export function classify(parameter, value) {
  const th = THRESHOLDS[parameter];
  if (!th) return { status: 'UNKNOWN', threshold: null, reason: 'no validated threshold configured for this parameter' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'UNKNOWN', threshold: null, reason: 'missing or non-numeric value' };
  if (value < th.low_crit) return { status: 'CRITICAL', threshold: th.low_crit, unit: th.unit, rule: `value < ${th.low_crit}` };
  if (value < th.low_warn) return { status: 'WARNING', threshold: th.low_warn, unit: th.unit, rule: `${th.low_crit} <= value < ${th.low_warn}` };
  return { status: 'NORMAL', threshold: null, unit: th.unit, rule: `value >= ${th.low_warn}` };
}

export const worst = (statuses) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'UNKNOWN');

/** Fresh/stale state for a reading. Stale or absent data is never reported as healthy. */
export function dataState(recordedAt, now, staleAfterMinutes) {
  if (!recordedAt) return { state: 'NO_DATA', ageMinutes: null };
  const ageMinutes = (now - recordedAt) / 60000;
  return { state: ageMinutes > staleAfterMinutes ? 'STALE' : 'FRESH', ageMinutes: Math.max(0, Math.round(ageMinutes * 10) / 10) };
}

/** Risk status of a pond from its latest dissolved-oxygen reading: CRITICAL|WARNING|NORMAL|STALE|NO_DATA. */
export function pondRiskStatus(latestDo, now, staleAfterMinutes) {
  if (!latestDo) return 'NO_DATA';
  if (dataState(latestDo.recordedAt, now, staleAfterMinutes).state === 'STALE') return 'STALE';
  return classify('dissolved_oxygen', latestDo.value).status;
}
