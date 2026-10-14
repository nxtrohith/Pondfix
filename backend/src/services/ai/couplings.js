// Parameter couplings: rule-of-thumb knock-on effects ("temperature is rising, so oxygen is likely to fall in a few hours").
// Pure and deterministic; computed in code from the facts the advisor already builds. The output is a watch-out for the farmer and context
// for the advisor. It never creates, resolves or changes the severity of an alert, and it never claims anything is safe.
// All thresholds and lead times are PROVISIONAL demo values like the risk limits in risk.js: validate them per species before relying on them.
// Wording stays qualitative on purpose (no doses, no quantities, no product names), which is also what policy.js guards for.

const IST_OFFSET_H = 5.5;
const MAX_AGE_MINUTES = 180; // readings older than this are not used to predict anything
const NH3_FRACTION_WATCH = 0.1; // share of total ammonia that is the toxic un-ionized form

/** Fraction of total ammonia present as un-ionized NH3 (Emerson et al. 1975, freshwater). Same formula as database/lib/wq-simulator.js. */
export function unionizedFraction(ph, tempC) {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15);
  return 1 / (1 + 10 ** (pKa - ph));
}

const istHour = (date) => (((+date / 3600000 + IST_OFFSET_H) % 24) + 24) % 24;
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

/**
 * parameters: advisor facts keyed by rule parameter ({ value, trend, minutesSinceReading, ... }); otherReadings: { name: { value, unit } };
 * at: Date. -> [{ id, from, affects, effect, leadHours: [min, max], precaution, basis }], most pressing first, at most 5.
 */
export function downstreamRisks({ parameters = {}, otherReadings = {}, at = new Date() } = {}) {
  const fresh = (p) => { const v = parameters[p]; return v && Number.isFinite(v.value) && !(v.minutesSinceReading > MAX_AGE_MINUTES) ? v : null; };
  const other = (p) => (Number.isFinite(otherReadings[p]?.value) ? otherReadings[p].value : null);
  const temp = fresh('temperature'); const doo = fresh('dissolved_oxygen'); const ph = fresh('ph');
  const hour = istHour(at);
  const night = hour >= 18 || hour < 6;
  const out = [];

  if (temp && temp.trend === 'rising' && temp.value >= 28) {
    out.push({ id: 'temperature_rising_oxygen', from: 'temperature', affects: 'dissolved_oxygen', effect: 'falls', leadHours: [2, 4],
      basis: `Water temperature is rising (${fmt(temp.value)} °C); warm water holds less oxygen and stock uses more.`,
      precaution: 'Check that aeration is working before evening, and consider lighter feeding while the water stays warm.' });
  }

  if (doo && doo.trend === 'falling' && night) {
    out.push({ id: 'oxygen_falling_overnight', from: 'dissolved_oxygen', affects: 'dissolved_oxygen', effect: 'keeps falling', leadHours: [1, 8],
      basis: `Dissolved oxygen is falling (${fmt(doo.value, 2)} mg/L) after dark; with no photosynthesis it usually keeps falling until sunrise.`,
      precaution: 'Check aeration now rather than waiting for the limit to be crossed, and plan to re-check before dawn.' });
  }

  if (ph && temp) {
    const frac = unionizedFraction(ph.value, temp.value);
    if (frac >= NH3_FRACTION_WATCH) {
      const nh3 = other('un_ionized_ammonia'); const tan = other('ammonia');
      out.push({ id: 'ph_temperature_ammonia', from: 'ph', affects: 'un_ionized_ammonia', effect: 'is more toxic', leadHours: [0, 3],
        basis: `At pH ${fmt(ph.value, 2)} and ${fmt(temp.value)} °C about ${Math.round(frac * 100)}% of any ammonia is in the toxic un-ionized form${nh3 !== null ? ` (un-ionized ammonia ${fmt(nh3, 3)} mg/L)` : tan !== null ? ` (total ammonia ${fmt(tan, 2)} mg/L)` : ''}.`,
        precaution: 'Re-test ammonia with a second meter or test kit, and go easy on feeding until pH or temperature come down.' });
    }
  }

  if (ph && doo && ph.value >= 8.4 && doo.value >= 8 && hour >= 12 && hour < 18) {
    out.push({ id: 'bloom_overnight_oxygen_crash', from: 'ph', affects: 'dissolved_oxygen', effect: 'may crash before dawn', leadHours: [8, 16],
      basis: `High pH (${fmt(ph.value, 2)}) with oxygen well above saturation (${fmt(doo.value, 2)} mg/L) in the afternoon suggests a dense algae bloom, which uses oxygen overnight.`,
      precaution: 'Have aeration ready for the night and check oxygen late evening and before dawn.' });
  }

  const nitrite = other('nitrite');
  if (doo && doo.value < 4) {
    out.push({ id: 'low_oxygen_nitrite', from: 'dissolved_oxygen', affects: 'nitrite', effect: 'builds up', leadHours: [6, 24],
      basis: `Dissolved oxygen is low (${fmt(doo.value, 2)} mg/L), which slows the bacteria that clear nitrite${nitrite !== null ? ` (nitrite now ${fmt(nitrite, 3)} mg/L)` : ''}.`,
      precaution: 'Once oxygen has recovered, re-test nitrite and ammonia.' });
  }

  const alk = other('alkalinity');
  if (alk !== null && alk < 50) {
    out.push({ id: 'low_alkalinity_ph_swings', from: 'alkalinity', affects: 'ph', effect: 'swings widely', leadHours: [12, 48],
      basis: `Alkalinity is low (${fmt(alk, 0)} mg/L as CaCO3), so the water buffers pH poorly.`,
      precaution: 'Expect larger day-night pH swings; re-test alkalinity and follow your farm procedure for correcting it.' });
  }

  // Most pressing first: shortest lead time, then id for a stable order.
  return out.sort((a, b) => (a.leadHours[0] - b.leadHours[0]) || a.id.localeCompare(b.id)).slice(0, 5);
}
