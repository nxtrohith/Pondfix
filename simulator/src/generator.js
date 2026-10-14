// Synthetic pond readings for all seven parameters. No ML: a small physical model with a per-pond "personality" so that ponds differ.
//   weather   slow cloud-cover and air-temperature anomalies (days) drive everything else
//   temperature  daily cycle peaking mid-afternoon (water lags air) + weather anomaly
//   dissolved_oxygen  relaxes toward a target = fraction of saturation (falls with temperature) + a photosynthesis swing that is
//                     weaker on cloudy days, minus a penalty when ammonia is high; cloudy spells can push a pond into low-DO alerts
//   ph  follows oxygen (photosynthesis removes CO2), so it peaks in the afternoon and bottoms out before dawn
//   water_level  slow evaporation, occasional rain, and a refill when the pond gets low
//   ammonia / nitrate / turbidity  from database/lib/wq-simulator.js, driven by the DO, pH and temperature produced here
// Deterministic: the same seed text and the same sequence of times always give the same readings. Values are NOT measurements.
import { createHash } from 'node:crypto';
import { createSimulator as createChemistry } from '../../database/lib/wq-simulator.js';

export const GENERATOR_VERSION = 'pond-gen-v1';
const IST_OFFSET_H = 5.5;
const MAX_DT_H = 6; // after a longer gap the state is advanced as if only this long passed

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d) => Number(x.toFixed(d));

function rng(seedText) {
  let a = createHash('sha1').update(`${GENERATOR_VERSION}:${seedText}`).digest().readUInt32LE(0);
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

/** Freshwater oxygen saturation (mg/L) at sea level, Benson-Krause style polynomial; ~7.7 at 28 C. */
export const oxygenSaturation = (t) => 14.652 - 0.41022 * t + 0.007991 * t * t - 0.000077774 * t * t * t;

/**
 * One generator per pond. `step(recordedAt)` must be called with non-decreasing times and returns the seven values for that instant.
 * `initial` (optional, any subset of the seven parameters keyed by name) resumes from known readings.
 */
export function createPondGenerator(seedText, initial = {}) {
  const r = rng(seedText);
  const pond = { // personality
    baseTemp: 25.5 + 4 * r.uniform(),
    tempAmp: 1.2 + 1.3 * r.uniform(),
    productivity: 0.6 + 0.8 * r.uniform(),
    doOffset: -0.6 + 1.2 * r.uniform(),
    phBase: 7.55 + 0.5 * r.uniform(),
    depth: 1.0 + 0.8 * r.uniform(),
  };
  const chem = createChemistry(`${seedText}:chem`, initial);
  const has = (k) => Number.isFinite(initial[k]);
  const s = {
    t: null,
    cloud: clamp(0.3 + 0.3 * r.normal(), 0, 1),
    tempAnom: 0,
    temperature: has('temperature') ? initial.temperature : null,
    dissolved_oxygen: has('dissolved_oxygen') ? initial.dissolved_oxygen : null,
    ph: has('ph') ? initial.ph : null,
    water_level: has('water_level') ? initial.water_level : pond.depth,
    ammonia: has('ammonia') ? initial.ammonia : 0.15,
  };

  function step(recordedAt) {
    const at = +recordedAt;
    if (!Number.isFinite(at)) throw new TypeError('recordedAt must be a valid Date');
    if (s.t !== null && at < s.t) throw new RangeError('times must be supplied in order');
    const dt = s.t === null ? 0 : clamp((at - s.t) / 3600000, 0, MAX_DT_H);
    s.t = at;
    const hour = ((at / 3600000 + IST_OFFSET_H) % 24 + 24) % 24;
    const sqrtDt = Math.sqrt(dt);

    // weather (slow Ornstein-Uhlenbeck processes, time constants in hours)
    s.cloud = clamp(s.cloud + (0.3 - s.cloud) * (1 - Math.exp(-dt / 36)) + 0.07 * r.normal() * sqrtDt, 0, 1);
    s.tempAnom += -s.tempAnom * (1 - Math.exp(-dt / 48)) + 0.24 * r.normal() * sqrtDt;

    // temperature
    const tTarget = pond.baseTemp + s.tempAnom - 0.8 * s.cloud + pond.tempAmp * (1 - 0.5 * s.cloud) * Math.cos((2 * Math.PI * (hour - 15.5)) / 24);
    s.temperature = s.temperature === null ? tTarget : s.temperature + (tTarget - s.temperature) * (1 - Math.exp(-dt / 2)) + 0.03 * r.normal() * sqrtDt;
    const T = clamp(s.temperature, 5, 45);

    // dissolved oxygen
    const swing = 2.3 * pond.productivity * (1 - 0.6 * s.cloud);
    const loadPenalty = 0.5 * Math.max(0, s.ammonia - 0.5);
    const doTarget = 0.72 * oxygenSaturation(T) + pond.doOffset - 1.2 * s.cloud - loadPenalty + swing * Math.cos((2 * Math.PI * (hour - 15)) / 24);
    s.dissolved_oxygen = s.dissolved_oxygen === null ? doTarget : s.dissolved_oxygen + (doTarget - s.dissolved_oxygen) * (1 - Math.exp(-dt / 0.75)) + 0.1 * r.normal() * sqrtDt;
    s.dissolved_oxygen = clamp(s.dissolved_oxygen, 0.3, 20);

    // pH follows oxygen
    const phTarget = pond.phBase + 0.22 * (s.dissolved_oxygen - 5.5);
    s.ph = s.ph === null ? phTarget : s.ph + (phTarget - s.ph) * (1 - Math.exp(-dt / 1.5)) + 0.02 * r.normal() * sqrtDt;
    s.ph = clamp(s.ph, 6, 9.5);

    // water level (m): evaporation, rain, refill
    s.water_level -= 0.0003 * dt * (0.6 + 0.4 * Math.cos((2 * Math.PI * (hour - 14)) / 24) ** 2 + 0.4 * (1 - s.cloud));
    if (r.uniform() < dt / (24 * 12)) s.water_level += 0.03 + 0.05 * r.uniform();
    if (s.water_level < pond.depth - 0.2 && r.uniform() < dt / 6) s.water_level = pond.depth + 0.02 * r.uniform();
    s.water_level = clamp(s.water_level, 0.3, 50);

    const [ammonia, nitrate, turbidity] = chem.step({ recordedAt, do: s.dissolved_oxygen, ph: s.ph, temp: T });
    s.ammonia = ammonia.value;

    return [
      { parameter: 'dissolved_oxygen', value: round(s.dissolved_oxygen, 2), unit: 'mg/L' },
      { parameter: 'ph', value: round(s.ph, 2), unit: 'pH' },
      { parameter: 'temperature', value: round(T + 0.03 * r.normal(), 2), unit: 'C' },
      { parameter: 'water_level', value: round(s.water_level + 0.003 * r.normal(), 3), unit: 'm' },
      ammonia, nitrate, turbidity,
    ];
  }
  return { step, personality: Object.freeze({ ...pond }) };
}
