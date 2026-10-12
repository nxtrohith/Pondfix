// "24 to 31 °C", "at least 5 mg/L", "above 4 mg/L". Used for reference ranges, which are context and never alert limits.
export interface Range { min?: number; max?: number; above?: number }

export function rangeText(r: Range, unit = ''): string {
  const sfx = unit ? ` ${unit}` : '';
  if (r.min !== undefined && r.max !== undefined) return `${r.min} to ${r.max}${sfx}`;
  if (r.min !== undefined) return `at least ${r.min}${sfx}`;
  if (r.above !== undefined) return `above ${r.above}${sfx}`;
  if (r.max !== undefined) return `up to ${r.max}${sfx}`;
  return 'not specified';
}
