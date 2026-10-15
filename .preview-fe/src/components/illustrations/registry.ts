// Asset registry for the AquaGuard illustration library. Every file in /public/illustrations/png comes from docs/aquaguard_individual_pngs
// (600x600, transparent); the matching isolated SVG lives in /public/illustrations/svg. This file is the only place that knows asset names,
// and the adapters below are the only place that decides which asset represents which application state.
import type { RiskStatus } from '@/lib/api/schemas';

export const ILLUSTRATIONS = {
  pond_calm: 'Calm pond', pond_mild: 'Disturbed pond', pond_severe: 'Pond in severe distress',
  aerator_on: 'Aerator running', aerator_off: 'Aerator stopped',
  controlbox_neutral: 'Control box', controlbox_on: 'Control box, on', controlbox_off: 'Control box, off',
  inlet_pipe: 'Inlet pipe', outlet_pipe: 'Outlet pipe',
  water_level_sensor: 'Water-level sensor', low_water_indicator: 'Low water level indicator',
  temperature_probe: 'Temperature probe', ph_meter: 'pH meter', do_meter: 'Dissolved-oxygen meter', test_kit: 'Water test kit',
  fish_normal: 'Fish swimming normally', fish_sluggish: 'Fish with low activity', fish_gasping: 'Fish gasping at the surface', fish_motionless: 'Motionless fish',
  feed_dispenser: 'Feed dispenser', feed_bucket: 'Feed bucket', feed_pellets: 'Feed pellets',
  farmer_neutral: 'Farmer', farmer_inspecting: 'Farmer checking a tablet', farmer_concerned: 'Concerned farmer',
  icon_check_green: 'Done', icon_cross_red: 'Not allowed', icon_warning_triangle: 'Warning', icon_curved_arrow: 'Turn', icon_direction_arrow: 'Next',
  icon_up_arrow: 'Increase', icon_down_arrow: 'Decrease', icon_refresh_arrow: 'Re-test',
  marker_normal: 'Healthy pond marker', marker_warning: 'Attention-needed pond marker', marker_critical: 'Critical pond marker',
} as const;
export type IllustrationId = keyof typeof ILLUSTRATIONS;

export const pngSrc = (id: IllustrationId) => `/illustrations/png/${id}.png`;
export const svgSrc = (id: IllustrationId) => `/illustrations/svg/${id}.svg`;

/** Pond-level status as the app already computes it (RiskStatus, or ERROR when the pond could not be loaded). */
export type PondHealth = RiskStatus | 'ERROR';
/** Statuses where the app does not actually know the condition. They must never look healthy. */
export const isUnknownHealth = (h: PondHealth) => h === 'STALE' || h === 'NO_DATA' || h === 'UNKNOWN' || h === 'ERROR';

export const pondFor = (h: PondHealth): IllustrationId => (h === 'CRITICAL' ? 'pond_severe' : h === 'WARNING' ? 'pond_mild' : 'pond_calm');
/** No marker exists for unknown conditions, so callers get null and show the status badge only. */
export const markerFor = (h: PondHealth): IllustrationId | null => (h === 'CRITICAL' ? 'marker_critical' : h === 'WARNING' ? 'marker_warning' : h === 'NORMAL' ? 'marker_normal' : null);

/** The measuring equipment for a parameter the backend monitors. */
export const equipmentFor = (parameter: string): IllustrationId | null =>
  ({ dissolved_oxygen: 'do_meter', ph: 'ph_meter', temperature: 'temperature_probe', water_level: 'water_level_sensor' } as Record<string, IllustrationId>)[parameter] ?? null;

/** Activity classes for fish. The backend does not report these yet; the component exists so a detection feed can drive it without UI changes. */
export type FishActivity = 'normal' | 'low' | 'distressed' | 'motionless';
export const FISH_ACTIVITY_LABEL: Record<FishActivity, string> = { normal: 'Normal activity', low: 'Low activity', distressed: 'Distressed (gasping)', motionless: 'Motionless' };
export const fishFor = (a: FishActivity): IllustrationId => ({ normal: 'fish_normal', low: 'fish_sluggish', distressed: 'fish_gasping', motionless: 'fish_motionless' } as const)[a];
