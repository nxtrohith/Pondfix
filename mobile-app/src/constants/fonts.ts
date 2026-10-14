// Display typeface for titles: Manrope, a clean geometric sans with strong weights. Body and data text stay on the platform font, which
// keeps numerals and small text crisp. Loaded once in the root layout (static cuts: variable fonts are not supported natively before SDK 58).
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';

export const fontFiles = { Manrope_700Bold, Manrope_800ExtraBold } as const;

/** `fontWeight: 'normal'` is set alongside these, so Android does not thicken an already-bold face. */
export const fonts = {
  /** Landing wordmark, screen titles, section headings. */
  display: 'Manrope_800ExtraBold',
  /** Subheads that need weight without the full display punch. */
  heading: 'Manrope_700Bold',
} as const;
