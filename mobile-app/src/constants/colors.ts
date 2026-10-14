// Single source of colour for the app. Screens and components use these semantic tokens, never raw HEX codes.
//
// Direction: a calm sage page, warm ivory surfaces and deep olive for emphasis. Everything stays in one natural family; status colours are
// muted and earthy, never neon.
//
// Contrast rules the tokens are built around (checked against WCAG AA):
//   * Text sitting directly on the sage page uses the `textOnBackground*` tokens (dark olive). `textSecondary` / `textMuted` are for ivory
//     surfaces only; on sage they fall below 4.5:1.
//   * Status text uses the "*Dark" token on an ivory or tinted surface, never on bare sage.
//   * Fills, icons and borders need 3:1, which the base palette meets.
const palette = {
  sage: '#A8B889',
  sageLine: '#C3CFA6',
  oliveSecondary: '#71845A',
  oliveLight: '#CBD5AE',
  oliveDark: '#46543A',

  ivory: '#F4F4E8',
  ivoryRaised: '#FAFAF2',
  ivoryMuted: '#E9EBDB',
  ivoryInput: '#F9F9F0',
  hairline: '#D5DAC4',
  divider: '#E1E5D2',

  ink: '#1E241B',
  inkSecondary: '#66705C',
  inkMuted: '#5F6954',
  onBackgroundSecondary: '#36422D',

  healthy: '#4F7D45',
  healthyText: '#2F5A2B',
  healthySurface: '#DFE9D0',
  warning: '#B9791E',
  warningText: '#7A4A0C',
  warningSurface: '#F6E7C6',
  critical: '#A6443A',
  criticalText: '#86312A',
  criticalSurface: '#F2DAD3',
  criticalOnBackground: '#6E2620',
  info: '#4E7A86',
  infoText: '#2F5D69',
  infoSurface: '#DCE8E8',
  neutral: '#8A917B',
  unavailable: '#747B66',

  water: '#4A7B8C',
  pondField: '#8FA175',
  pondEmbankment: '#C9C3A1',
} as const;

export const colors = {
  // Page and brand.
  background: palette.sage,
  primary: palette.oliveSecondary,
  primaryDark: palette.oliveDark,
  primaryLight: palette.oliveLight,
  topographicLine: palette.sageLine,
  topographicLineMuted: palette.sageLine,
  topographicBackground: palette.sage,
  water: palette.water,
  pondField: palette.pondField,
  pondEmbankment: palette.pondEmbankment,

  // Surfaces. `card` is the ivory surface; `surfaceElevated` sits one step above it.
  surface: palette.ivory,
  surfaceElevated: palette.ivoryRaised,
  surfaceOverlay: palette.oliveLight,
  card: palette.ivory,
  cardSecondary: palette.ivoryRaised,
  cardMuted: palette.ivoryMuted,
  inputBackground: palette.ivoryInput,
  border: palette.hairline,
  divider: palette.divider,
  /** Hairline for controls that sit on the sage page rather than on an ivory surface. */
  borderOnBackground: 'rgba(70, 84, 58, 0.55)',

  // Text on ivory surfaces.
  textPrimary: palette.ink,
  textSecondary: palette.inkSecondary,
  textMuted: palette.inkMuted,
  // Text on the sage page.
  textOnBackground: palette.ink,
  textOnBackgroundSecondary: palette.onBackgroundSecondary,
  textOnBackgroundMuted: palette.onBackgroundSecondary,
  // Text and icons on deep olive or status fills.
  textOnDark: palette.ivory,

  // Status. Fills and icons use the base colour; text uses the "Dark" variant on the matching surface.
  healthy: palette.healthy,
  success: palette.healthy,
  healthyDark: palette.healthyText,
  healthySurface: palette.healthySurface,
  warning: palette.warning,
  warningDark: palette.warningText,
  warningSurface: palette.warningSurface,
  critical: palette.critical,
  criticalDark: palette.criticalText,
  criticalSurface: palette.criticalSurface,
  /** Error text that sits directly on the sage page (5:1 there; `criticalDark` is for ivory surfaces). */
  criticalOnBackground: palette.criticalOnBackground,
  info: palette.info,
  infoDark: palette.infoText,
  infoSurface: palette.infoSurface,
  neutral: palette.neutral,
  unavailable: palette.unavailable,

  // Buttons: ivory is the primary action on the sage page; deep olive is the secondary fill.
  buttonPrimary: palette.ivory,
  buttonPrimaryText: palette.oliveDark,
  buttonSecondary: palette.oliveDark,
  buttonSecondaryText: palette.ivory,
  buttonOutline: palette.oliveDark,
  buttonCritical: palette.critical,

  // Charts sit on ivory cards: deep olive line, faint grid, muted status colours only where data is in that state.
  chartLine: palette.oliveDark,
  chartGrid: 'rgba(70, 84, 58, 0.14)',
  chartAxis: palette.inkSecondary,
  chartPrediction: palette.info,
  chartThresholdWarning: palette.warning,
  chartThresholdCritical: palette.critical,

  // Dimming behind modal sheets, and the colour shadows are cast in.
  overlay: 'rgba(30, 36, 27, 0.5)',
  scrim: 'rgba(30, 36, 27, 0.5)',
  shadow: '#2F3A27',
} as const;

/** Opacity system for overlays, dividers and muted states. */
export const opacity = {
  topographic: 0.5,
  overlay: 0.5,
  divider: 0.12,
  muted: 0.6,
  disabled: 0.45,
} as const;

export type ColorToken = keyof typeof colors;
