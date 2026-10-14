// Pond-level knock-on effects for the dashboards: the same rule-of-thumb couplings the alert advisor uses (ai/couplings.js), computed on
// demand from the pond's latest readings and the last few hours of core-parameter history. Information only: it never creates or
// changes an alert, and it is not part of the pond status.
import { RULE_PARAMETERS } from './risk.js';
import { latestByParameter } from './queries.js';
import { trendOf } from './ai/policy.js';
import { downstreamRisks } from './ai/couplings.js';

const SERIES_HOURS = 3; const MAX_AGE_MINUTES = 180;

export async function pondDownstreamRisks(db, pond, now) {
  const t = now();
  const latest = await latestByParameter(db, pond._id);
  const rows = await db.collection('measurements')
    .find({ pondId: pond._id, recordedAt: { $gte: new Date(+t - SERIES_HOURS * 3600000), $lte: t } }, { projection: { recordedAt: 1, values: 1 } })
    .sort({ recordedAt: 1 }).limit(400).toArray();
  const series = {};
  for (const r of rows) for (const v of r.values ?? []) if (RULE_PARAMETERS.includes(v.parameter)) (series[v.parameter] ??= []).push(v.value);
  const age = (l) => Math.round((+t - +l.recordedAt) / 60000);
  const parameters = {}; const otherReadings = {};
  for (const [p, l] of Object.entries(latest)) {
    if (RULE_PARAMETERS.includes(p)) parameters[p] = { value: l.value, trend: trendOf(p, series[p]), minutesSinceReading: age(l) };
    else if (age(l) <= MAX_AGE_MINUTES) otherReadings[p] = { value: l.value, unit: l.unit };
  }
  return { pondId: String(pond._id), generatedAt: t, risks: downstreamRisks({ parameters, otherReadings, at: t }) };
}
