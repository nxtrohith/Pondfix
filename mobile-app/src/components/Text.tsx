// The app's Text. Same API as React Native's, plus two script-aware corrections so every language reads well without touching each style:
//   * Line height. Indic and Arabic-script text has tall marks above and below the line that a Latin-sized line height clips or crowds, so
//     non-Latin languages get a more generous line height (never less than the style already asked for).
//   * Display face. Manrope (the title font) has no Indic or Arabic glyphs, so for those languages titles use the platform font at the same
//     weight instead of a regular-weight fallback glyph, which would lose the hierarchy.
import { createContext, useContext } from 'react';
import { Platform, StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fonts } from '@/constants/fonts';
import { languageInfo, type Script } from '@/i18n/languages';

const PLATFORM_FONT = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });
/** Nested text inherits its parent's line box; adjusting it too would make the lines uneven. */
const Nested = createContext(false);

/** Exported so the behaviour is unit-tested without rendering. */
export function scriptOverride(script: Script, flat: TextStyle, nested = false): TextStyle | null {
  if (script === 'latin') return null;
  const out: TextStyle = {};
  if (!nested) out.lineHeight = Math.max(flat.lineHeight ?? 0, Math.round((flat.fontSize ?? 14) * (script === 'arabic' ? 1.75 : 1.6)));
  if (flat.fontFamily === fonts.display || flat.fontFamily === fonts.heading) {
    out.fontFamily = PLATFORM_FONT;
    out.fontWeight = flat.fontFamily === fonts.display ? '800' : '700';
  }
  return out;
}

export function Text({ style, ...rest }: TextProps) {
  const { i18n } = useTranslation(); // subscribes to language changes, so text re-renders at once when the language is switched
  const nested = useContext(Nested);
  const override = scriptOverride(languageInfo(i18n.language).script, StyleSheet.flatten(style) ?? {}, nested);
  return (
    <Nested.Provider value>
      <RNText {...rest} style={override ? [style, override] : style} />
    </Nested.Provider>
  );
}

export type { TextProps };
