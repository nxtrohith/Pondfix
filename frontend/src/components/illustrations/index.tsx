// AquaGuard illustration components. Each one takes application state (never raw asset names) and picks the asset through registry.ts.
import type { ReactNode } from 'react';
import { AnimatedIllustration } from './AnimatedIllustration';
import { Illustration } from './Illustration';
import { FISH_ACTIVITY_LABEL, equipmentFor, fishFor, isUnknownHealth, markerFor, pondFor, type FishActivity, type IllustrationId, type PondHealth } from './registry';
import { POND_STATUS } from '@/lib/terms';
import { PARAM_LABEL } from '@/lib/format';

export { Illustration } from './Illustration';
export { AnimatedIllustration, useReducedMotion } from './AnimatedIllustration';
export * from './registry';

interface Sized { size?: number; className?: string }

/** The pond surface for a pond-level status. Unknown conditions show the calm pond dimmed, never as healthy. */
export function PondIllustration({ health, size = 120, className, alt }: Sized & { health: PondHealth; alt?: string }) {
  return <Illustration key={pondFor(health)} id={pondFor(health)} size={size} muted={isUnknownHealth(health)} className={className} alt={alt ?? `Pond: ${POND_STATUS[health].label}`} />;
}

/** Map-style pin: healthy / attention needed / critical. Renders nothing when the condition is unknown (the status badge says so). */
export function PondStatusMarker({ health, size = 40, className }: Sized & { health: PondHealth }) {
  const id = markerFor(health);
  return id ? <Illustration key={id} id={id} size={size} className={className} alt={POND_STATUS[health].label} /> : null;
}

/** Pond with its status marker pinned to the corner. */
export function PondScene({ health, size = 128, className }: Sized & { health: PondHealth }) {
  const pin = Math.round(size * 0.36);
  return (
    <div className={className} style={{ position: 'relative', width: size, height: size * 0.8 }}>
      <PondIllustration health={health} size={size} className="absolute inset-x-0 -top-[10%]" />
      {markerFor(health) ? <PondStatusMarker health={health} size={pin} className="absolute -right-1 -top-1" /> : null}
    </div>
  );
}

/** Measuring equipment for a monitored parameter (dissolved_oxygen, ph, temperature, water_level). Returns null for anything else. */
export function ParameterEquipment({ parameter, size = 64, className }: Sized & { parameter: string }) {
  const id = equipmentFor(parameter);
  return id ? <Illustration id={id} size={size} className={className} alt={`${PARAM_LABEL[parameter] ?? parameter} equipment`} /> : null;
}
export const DissolvedOxygenMeterIllustration = (p: Sized) => <ParameterEquipment parameter="dissolved_oxygen" {...p} />;
export const PHMeterIllustration = (p: Sized) => <ParameterEquipment parameter="ph" {...p} />;
export const TemperatureProbeIllustration = (p: Sized) => <ParameterEquipment parameter="temperature" {...p} />;
/** `low` swaps in the low-water indicator; pass it only when a water-level status says so. */
export const WaterLevelSensorIllustration = ({ low, ...p }: Sized & { low?: boolean }) =>
  low ? <Illustration id="low_water_indicator" alt="Low water level" {...p} /> : <ParameterEquipment parameter="water_level" {...p} />;

/** `state`: running animates paddles and splash; stopped is still; unknown is dimmed so it never implies a state. */
export function AeratorIllustration({ state, size = 120, className }: Sized & { state: 'running' | 'stopped' | 'unknown' }) {
  if (state === 'running') return <AnimatedIllustration source="aerator_on" active title="Aerator running" size={size} className={className} />;
  return <Illustration id="aerator_off" size={size} className={className} muted={state === 'unknown'} alt={state === 'unknown' ? 'Aerator state unknown' : 'Aerator stopped'} />;
}

/** Inlet / outlet pipe. Water moves only while `flowing` is true. */
export function FlowPipeIllustration({ kind, flowing, size = 120, className }: Sized & { kind: 'inlet' | 'outlet'; flowing: boolean }) {
  const name = kind === 'inlet' ? 'Inlet' : 'Outlet';
  return <AnimatedIllustration source={kind === 'inlet' ? 'inlet_pipe' : 'outlet_pipe'} active={flowing} title={`${name} pipe${flowing ? ', water flowing' : ''}`} size={size} className={className} />;
}

/** One fish-activity class from a detection result. The tail moves for normal, low and distressed fish and never for a motionless one. */
export function FishStatusIllustration({ activity, animated = true, size = 96, className }: Sized & { activity: FishActivity; animated?: boolean }) {
  return <AnimatedIllustration source={fishFor(activity) as 'fish_normal'} active={animated && activity !== 'motionless'} title={FISH_ACTIVITY_LABEL[activity]} size={size} className={className} />;
}

export type FarmerPose = 'neutral' | 'inspecting' | 'concerned';
/** Farmer pose. Only the concerned pose has moving parts (arms, sweat drop); animate it only when it reinforces an urgent instruction. */
export function FarmerActionIllustration({ pose, animated = false, size = 96, className }: Sized & { pose: FarmerPose; animated?: boolean }) {
  if (pose === 'concerned') return <AnimatedIllustration source="farmer_concerned" active={animated} title="Concerned farmer" size={size} className={className} />;
  return <Illustration id={pose === 'inspecting' ? 'farmer_inspecting' : 'farmer_neutral'} size={size} className={className} />;
}

export const FeedDispenserIllustration = (p: Sized) => <Illustration id="feed_dispenser" size={p.size ?? 96} className={p.className} />;

/** Pictogram that reinforces an instruction. Decorative by default: the instruction text always carries the meaning. */
export function ActionIcon({ name, size = 28, className, label }: Sized & { name: Extract<IllustrationId, `icon_${string}`>; label?: string }): ReactNode {
  return <Illustration id={name} size={size} className={className} alt={label ?? ''} />;
}
