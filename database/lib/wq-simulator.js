// DEMO-ONLY water-chemistry simulator: ammonia, nitrate, nitrite, turbidity, alkalinity and salinity derived from the real dissolved
// oxygen, pH and temperature of a pond, plus un-ionized ammonia computed from ammonia, pH and temperature. The output is plausible and internally consistent; it is NOT measured data and is always stored with source "simulated".
//
// Relationships (all coefficients are demo choices, not calibrated to any farm):
//   ammonia   (total ammonia nitrogen, mg/L): relaxes toward a target that rises with feeding (pulses ~3 h after 08:30 and 17:00 IST),
//             with warmth, and with low dissolved oxygen (less nitrification).
//   nitrate   (mg/L): slow accumulation fed by ammonia and limited by oxygen (nitrification needs oxygen), a small loss term, and
//             occasional partial water exchanges that cut it back.
//   turbidity (NTU): a base level plus algae bloom (high pH and supersaturated oxygen) plus rare rain/disturbance spikes that decay.
//   nitrite   (mg/L): made from ammonia, cleared by oxygen-dependent bacteria, so it builds up when oxygen is low.
//   alkalinity (mg/L as CaCO3): slowly consumed by nitrification, pulled back toward a pond baseline, diluted by rain.
//   salinity  (ppt): drifts around a per-pond baseline, concentrated by warmth (evaporation), diluted by rain.
//   un_ionized_ammonia (mg/L NH3, DERIVED): the toxic fraction of total ammonia (Emerson et al. 1975); a pure function of ammonia, pH, temp.
// Deterministic: the same seed text and the same inputs always give the same output.
import { createHash } from 'node:crypto';

export const SIM_VERSION = 'wq-sim-v2';
export const SIM_PARAMETERS = Object.freeze([
  Object.freeze({ parameter: 'ammonia', unit: 'mg/L', decimals: 3 }),
  Object.freeze({ parameter: 'nitrate', unit: 'mg/L', decimals: 2 }),
  Object.freeze({ parameter: 'turbidity', unit: 'NTU', decimals: 1 }),
  Object.freeze({ parameter: 'nitrite', unit: 'mg/L', decimals: 3 }),
  Object.freeze({ parameter: 'alkalinity', unit: 'mg/L', decimals: 0 }),
  Object.freeze({ parameter: 'salinity', unit: 'ppt', decimals: 1 }),
  Object.freeze({ parameter: 'un_ionized_ammonia', unit: 'mg/L', decimals: 4 }),
]);
/** Parameters computed from other readings rather than simulated as their own state (the UI should label them "derived"). */
export const DERIVED_PARAMETERS = Object.freeze(['un_ionized_ammonia']);

/** Fraction of total ammonia nitrogen present as toxic un-ionized NH3 at this pH and temperature (Emerson et al. 1975, freshwater). */
export function unionizedFraction(ph, tempC) {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15);
  return 1 / (1 + 10 ** (pKa - ph));
}

const IST_OFFSET_H = 5.5;
const MAX_DT_H = 6; // after a longer gap the state is advanced as if only this long passed (it relaxes, it does not run away)
const NEUTRAL = { do: 6, ph: 7.8, temp: 28 }; // used only when a reading is missing

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d) => Number(x.toFixed(d));

/** mulberry32 seeded from a hash of the text. */
function rng(seedText) {
  let a = createHash('sha1').update(`${SIM_VERSION}:${seedText}`).digest().readUInt32LE(0);
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(uniform() || 1e-12)) * Math.cos(2 * Math.PI * uniform());
  return { uniform, normal };
}

const bump = (hour, centre, sigma) => { // circular gaussian over the 24 h clock
  const d = Math.min(Math.abs(hour - centre), 24 - Math.abs(hour - centre));
  return Math.exp(-0.5 * (d / sigma) ** 2);
};

/**
 * One simulator per pond. Call `step` with observations in time order. Missing do/ph/temp (null/undefined) fall back to the last seen
 * value, then to a neutral default. Returns the three simulated values for that instant.
 */
export function createSimulator(seedText, initial = {}) {
  const r = rng(seedText);
  const s = {
    t: null, last: { ...NEUTRAL },
    ammonia: 0.1 + 0.1 * r.uniform(),
    nitrate: 3 + 9 * r.uniform(),
    turbidity: 12 + 18 * r.uniform(),
    spike: 0,
    nitrite: 0.03 + 0.04 * r.uniform(),
    alkalinity: 90 + 60 * r.uniform(),
    salinity: 0.5 + 14 * r.uniform(),
    saltBase: 0,
  };
  s.saltBase = s.salinity;
  // Resume from known values (e.g. a pond's last stored reading) instead of the seeded start.
  for (const k of ['ammonia', 'nitrate', 'turbidity', 'nitrite', 'alkalinity', 'salinity']) if (Number.isFinite(initial[k])) s[k] = initial[k];

  function step({ recordedAt, do: doV, ph, temp }) {
    const at = +recordedAt;
    if (!Number.isFinite(at)) throw new TypeError('recordedAt must be a valid Date');
    if (s.t !== null && at < s.t) throw new RangeError('observations must be supplied in time order');
    const dt = s.t === null ? 0 : clamp((at - s.t) / 3600000, 0, MAX_DT_H);
    s.t = at;
    const DO = Number.isFinite(doV) ? (s.last.do = doV) : s.last.do;
    const PH = Number.isFinite(ph) ? (s.last.ph = ph) : s.last.ph;
    const T = Number.isFinite(temp) ? (s.last.temp = temp) : s.last.temp;
    const hour = ((at / 3600000 + IST_OFFSET_H) % 24 + 24) % 24;

    // ammonia
    const feed = Math.max(bump(hour, 11.5, 2), bump(hour, 20, 2));
    const lowO2 = clamp((5 - DO) / 5, 0, 1);
    const targetNH = (0.1 + 0.09 * feed) * Math.exp(0.05 * (T - 28)) * (1 + 1.5 * lowO2);
    const k = 1 - Math.exp(-dt / 6);
    s.ammonia = clamp(s.ammonia + (targetNH - s.ammonia) * k + s.ammonia * 0.03 * r.normal() * Math.sqrt(dt), 0.01, 8);

    // nitrate
    const ox = clamp(DO / 6, 0.2, 1);
    s.nitrate += dt * (0.05 * (s.ammonia / 0.15) * ox - 0.002 * s.nitrate) + 0.04 * r.normal() * Math.sqrt(dt);
    if (r.uniform() < dt / (24 * 14)) s.nitrate *= 0.65 + 0.2 * r.uniform(); // partial water exchange
    s.nitrate = clamp(s.nitrate, 0, 200);

    // turbidity
    s.spike *= Math.exp(-dt / 18);
    const rain = r.uniform() < dt / (24 * 10);
    if (rain) s.spike += 20 + 60 * r.uniform(); // rain / disturbance
    const bloom = 25 * clamp((PH - 7.6) / 1.2, 0, 1.5) + 6 * clamp((DO - 6) / 4, 0, 1.5);
    const targetTu = 14 + bloom;
    s.turbidity = clamp(s.turbidity + (targetTu - s.turbidity) * (1 - Math.exp(-dt / 10)) + 0.4 * r.normal() * Math.sqrt(dt), 1, 500);

    // nitrite: ammonia oxidisers make it, nitrite oxidisers (slower when oxygen is low) clear it
    const clearRate = 0.25 * ox;
    const nitriteTarget = (0.12 * s.ammonia * (0.4 + 0.6 * ox)) / clearRate;
    s.nitrite = clamp(s.nitrite + (nitriteTarget - s.nitrite) * (1 - Math.exp(-clearRate * dt)) + 0.01 * s.nitrite * r.normal() * Math.sqrt(dt), 0.001, 10);

    // alkalinity: nitrification consumes it, mixing restores it, rain dilutes it
    s.alkalinity += dt * (-0.15 * (s.ammonia / 0.15) * ox) + (110 - s.alkalinity) * (1 - Math.exp(-dt / 96)) + 0.3 * r.normal() * Math.sqrt(dt);
    if (rain) s.alkalinity *= 0.9;
    s.alkalinity = clamp(s.alkalinity, 20, 400);

    // salinity: evaporation (warm water) concentrates it slightly, rain dilutes it, it relaxes back to the pond baseline
    s.salinity += (s.saltBase * (1 + 0.004 * (T - 28)) - s.salinity) * (1 - Math.exp(-dt / 120)) + 0.01 * r.normal() * Math.sqrt(dt);
    if (rain) s.salinity *= 0.85 + 0.1 * r.uniform();
    s.salinity = clamp(s.salinity, 0, 45);

    const nh3 = clamp(s.ammonia * unionizedFraction(PH, T), 0, 5);

    return [
      { parameter: 'ammonia', value: round(s.ammonia, 3), unit: 'mg/L' },
      { parameter: 'nitrate', value: round(s.nitrate, 2), unit: 'mg/L' },
      { parameter: 'turbidity', value: round(clamp(s.turbidity + s.spike, 1, 500), 1), unit: 'NTU' },
      { parameter: 'nitrite', value: round(s.nitrite, 3), unit: 'mg/L' },
      { parameter: 'alkalinity', value: round(s.alkalinity, 0), unit: 'mg/L' },
      { parameter: 'salinity', value: round(s.salinity, 1), unit: 'ppt' },
      { parameter: 'un_ionized_ammonia', value: round(nh3, 4), unit: 'mg/L' },
    ];
  }
  return { step };
}
