// "24 to 31 °C", "at least 5 mg/L", "above 4 mg/L". Used for reference ranges, which are context and never alert limits.
import { t } from '@/i18n';

export interface Range { min?: number; max?: number; above?: number }

export function rangeText(r: Range, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  if (r.min !== undefined && r.max !== undefined) return t('range.between', { min: r.min, max: r.max, unit: u });
  if (r.min !== undefined) return t('range.atLeast', { value: r.min, unit: u });
  if (r.above !== undefined) return t('range.above', { value: r.above, unit: u });
  if (r.max !== undefined) return t('range.upTo', { value: r.max, unit: u });
  return t('range.notSpecified');
}
