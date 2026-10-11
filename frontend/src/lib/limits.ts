// Chart limit lines drawn from the backend's own rules (GET /api/risk-rules). One implementation for every chart.
import type { RiskRules } from './api/schemas';
import { fmtThreshold, unitLabel } from './format';
import type { Threshold } from '@/components/charts/TrendChart';

export function thresholdLines(rules: RiskRules | null, parameter: string): Threshold[] {
  const r = rules?.parameters?.[parameter];
  if (r) {
    const sfx = unitLabel(r.unit) ? ` ${unitLabel(r.unit)}` : '';
    const line = (y: number | undefined, text: string, tone: 'warn' | 'crit'): Threshold[] => (y === undefined ? [] : [{ y, label: `${text} ${y}${sfx}`, tone }]);
    return [...line(r.lowWarning, 'Warning below', 'warn'), ...line(r.highWarning, 'Warning above', 'warn'), ...line(r.lowCritical, 'Critical below', 'crit'), ...line(r.highCritical, 'Critical above', 'crit')];
  }
  // Older API without per-parameter rules: dissolved oxygen only.
  return parameter === 'dissolved_oxygen' && rules
    ? [{ y: rules.dissolvedOxygen.warningBelow, label: `Warning below ${fmtThreshold(rules.dissolvedOxygen.warningBelow)} mg/L`, tone: 'warn' }, { y: rules.dissolvedOxygen.criticalBelow, label: `Critical below ${fmtThreshold(rules.dissolvedOxygen.criticalBelow)} mg/L`, tone: 'crit' }]
    : [];
}
