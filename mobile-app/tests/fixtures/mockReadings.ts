// DEMO DATA. Deterministic water-quality readings for the demo ponds. Nothing here comes from a sensor.
// Each series ends at the latest reading, so a chart's last point always matches the value shown on the pond screen.
import type { Parameter, ParameterReading, SensorConnection, SeriesPoint } from '@/types';

const STEP_MIN = 15;
const DAYS = 7;

interface Spec {
  parameter: Parameter;
  sensor: SensorConnection;
  /** Latest value and its time. Null latest with an offline sensor means "last seen" only. */
  latest?: { value: number; at: string };
  lastSeenAt?: string;
  /** Shape of the history before the latest value (demo only). */
  base?: number;
  amplitude?: number;
}

/** Deterministic 7-day history at 15-minute steps ending at `endAt`. The last point is exactly `endValue`. */
export function buildSeries(endAt: string, endValue: number, base: number, amplitude: number): SeriesPoint[] {
  const n = DAYS * 24 * 60 / STEP_MIN + 1;
  const end = Date.parse(endAt);
  const points: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) {
    const at = new Date(end - (n - 1 - i) * STEP_MIN * 60000).toISOString();
    const wave = amplitude * Math.sin(i * 0.37) + amplitude * 0.3 * Math.sin(i * 1.31);
    points.push({ at, value: Math.round((base + wave) * 100) / 100 });
  }
  // Ease the last two hours into the current value so the trend on screen matches the latest reading.
  const ramp = 8;
  const startValue = points[n - 1 - ramp]!.value;
  for (let j = 0; j < ramp; j++) {
    const idx = n - ramp + j;
    const w = (j + 1) / ramp;
    points[idx] = { at: points[idx]!.at, value: Math.round((startValue * (1 - w) + endValue * w) * 100) / 100 };
  }
  points[n - 1] = { at: endAt, value: endValue };
  return points;
}

const SPECS: Record<string, Spec[]> = {
  'pond-1': [
    { parameter: 'dissolved_oxygen', sensor: 'online', latest: { value: 1.8, at: '2026-10-12T10:10:00.000Z' }, base: 5.0, amplitude: 0.6 },
    { parameter: 'ph', sensor: 'online', latest: { value: 7.2, at: '2026-10-12T10:15:00.000Z' }, base: 7.2, amplitude: 0.15 },
    { parameter: 'temperature', sensor: 'online', latest: { value: 26.8, at: '2026-10-12T10:15:00.000Z' }, base: 26.5, amplitude: 1.2 },
  ],
  'pond-2': [
    { parameter: 'dissolved_oxygen', sensor: 'online', latest: { value: 5.1, at: '2026-10-12T10:20:00.000Z' }, base: 5.2, amplitude: 0.4 },
    { parameter: 'ph', sensor: 'online', latest: { value: 6.3, at: '2026-10-12T10:25:00.000Z' }, base: 6.6, amplitude: 0.12 },
    { parameter: 'temperature', sensor: 'offline', lastSeenAt: '2026-10-12T08:20:00.000Z' },
  ],
  'pond-3': [
    { parameter: 'dissolved_oxygen', sensor: 'online', latest: { value: 4.4, at: '2026-10-12T10:20:00.000Z' }, base: 4.6, amplitude: 0.5 },
    { parameter: 'ph', sensor: 'online', latest: { value: 7.4, at: '2026-10-12T10:20:00.000Z' }, base: 7.4, amplitude: 0.1 },
    { parameter: 'temperature', sensor: 'online', latest: { value: 32.1, at: '2026-10-12T10:12:00.000Z' }, base: 30.5, amplitude: 1.0 },
  ],
  'pond-4': [
    { parameter: 'dissolved_oxygen', sensor: 'online', latest: { value: 5.6, at: '2026-10-12T10:25:00.000Z' }, base: 5.8, amplitude: 0.4 },
    { parameter: 'ph', sensor: 'online', latest: { value: 7.5, at: '2026-10-12T10:25:00.000Z' }, base: 7.5, amplitude: 0.1 },
    { parameter: 'temperature', sensor: 'online', latest: { value: 27.4, at: '2026-10-12T10:25:00.000Z' }, base: 27.2, amplitude: 0.8 },
  ],
};

function build(spec: Spec): ParameterReading {
  if (spec.sensor !== 'online' || !spec.latest) {
    return { parameter: spec.parameter, sensor: spec.sensor, latest: null, lastSeenAt: spec.lastSeenAt ?? null, series: [] };
  }
  return {
    parameter: spec.parameter,
    sensor: 'online',
    latest: { value: spec.latest.value, recordedAt: spec.latest.at },
    lastSeenAt: spec.latest.at,
    series: buildSeries(spec.latest.at, spec.latest.value, spec.base ?? spec.latest.value, spec.amplitude ?? 0.2),
  };
}

/** Readings for one demo pond (one entry per parameter). */
export function demoReadings(pondId: string): ParameterReading[] {
  return (SPECS[pondId] ?? []).map(build);
}

/** Forecast values are ILLUSTRATIVE demo numbers. They are not produced by the PondFix forecasting model. */
export const DEMO_FORECASTS: Record<string, Partial<Record<Parameter, { minutesAhead: 15 | 60 | 180; value: number }[]>>> = {
  'pond-1': {
    dissolved_oxygen: [{ minutesAhead: 15, value: 1.7 }, { minutesAhead: 60, value: 1.5 }, { minutesAhead: 180, value: 1.4 }],
    ph: [{ minutesAhead: 15, value: 7.2 }, { minutesAhead: 60, value: 7.1 }, { minutesAhead: 180, value: 7.0 }],
    temperature: [{ minutesAhead: 15, value: 27.0 }, { minutesAhead: 60, value: 27.3 }, { minutesAhead: 180, value: 27.8 }],
  },
  'pond-2': {
    dissolved_oxygen: [{ minutesAhead: 15, value: 5.0 }, { minutesAhead: 60, value: 4.9 }, { minutesAhead: 180, value: 4.8 }],
    ph: [{ minutesAhead: 15, value: 6.3 }, { minutesAhead: 60, value: 6.4 }, { minutesAhead: 180, value: 6.5 }],
  },
  'pond-3': {
    dissolved_oxygen: [{ minutesAhead: 15, value: 4.4 }, { minutesAhead: 60, value: 4.2 }, { minutesAhead: 180, value: 4.0 }],
    temperature: [{ minutesAhead: 15, value: 32.2 }, { minutesAhead: 60, value: 32.4 }, { minutesAhead: 180, value: 31.8 }],
  },
  'pond-4': {
    dissolved_oxygen: [{ minutesAhead: 15, value: 5.6 }, { minutesAhead: 60, value: 5.5 }, { minutesAhead: 180, value: 5.4 }],
    ph: [{ minutesAhead: 15, value: 7.5 }, { minutesAhead: 60, value: 7.5 }, { minutesAhead: 180, value: 7.6 }],
    temperature: [{ minutesAhead: 15, value: 27.4 }, { minutesAhead: 60, value: 27.6 }, { minutesAhead: 180, value: 27.9 }],
  },
};
