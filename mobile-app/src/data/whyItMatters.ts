// Generic, plain-language reasons a reading matters, used on the demo pond screens. Not species-specific and not an alert limit.
// Keys look like "dissolved_oxygen.low"; the dictionary key is the same with the dot replaced by an underscore (whyItMatters.*).
import { t } from '@/i18n';
import { lazyRecord } from '@/lib/lazy';

const KEYS = ['dissolved_oxygen.low', 'ph.low', 'ph.high', 'temperature.high', 'temperature.low'] as const;
type Key = (typeof KEYS)[number];

export const WHY_IT_MATTERS: Record<string, string> = lazyRecord(KEYS, (k: Key) => t(`whyItMatters.${k.replace('.', '_') as 'dissolved_oxygen_low'}`));
