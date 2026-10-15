import { ActionIcon, FarmerActionIllustration, Illustration } from './index';
import type { IllustrationId } from './registry';

type Icon = Extract<IllustrationId, `icon_${string}`>;
/** Pictograms for the guidance the app already gives (terms.ts GUIDANCE keys). A key with no entry shows no visual: no guide without a supported instruction. */
const GUIDE: Record<string, { tool: IllustrationId; toolLabel: string; action: Icon; actionLabel: string }> = {
  'dissolved_oxygen.low': { tool: 'aerator_on', toolLabel: 'Aerator', action: 'icon_check_green', actionLabel: 'make sure it is running' },
  'ph.high': { tool: 'test_kit', toolLabel: 'Water test kit', action: 'icon_refresh_arrow', actionLabel: 're-test' },
  'ph.low': { tool: 'test_kit', toolLabel: 'Water test kit', action: 'icon_refresh_arrow', actionLabel: 're-test' },
  'temperature.high': { tool: 'temperature_probe', toolLabel: 'Temperature probe', action: 'icon_down_arrow', actionLabel: 'bring the temperature down' },
  'temperature.low': { tool: 'temperature_probe', toolLabel: 'Temperature probe', action: 'icon_up_arrow', actionLabel: 'bring the temperature up' },
};
export const hasActionGuide = (parameter: string, direction?: 'low' | 'high') => `${parameter}.${direction ?? 'low'}` in GUIDE;

/**
 * Farmer + the equipment to use + the action, as a small picture strip beside written advice. Purely reinforcing: the written advice
 * next to it always says the same thing, so it is hidden from assistive technology. Severity picks the farmer's pose.
 */
export function ActionGuide({ parameter, direction, severity }: { parameter: string; direction?: 'low' | 'high'; severity: 'WARNING' | 'CRITICAL' }) {
  const g = GUIDE[`${parameter}.${direction ?? 'low'}`];
  if (!g) return null;
  return (
    <div aria-hidden="true" data-testid="action-guide" className="-my-4 flex shrink-0 items-center">
      <FarmerActionIllustration pose={severity === 'CRITICAL' ? 'concerned' : 'inspecting'} size={76} />
      <span className="relative -ml-2">
        <Illustration id={g.tool} size={76} alt="" />
        <ActionIcon name={g.action} size={26} className="absolute right-2 top-3 rounded-full bg-card" />
      </span>
    </div>
  );
}
