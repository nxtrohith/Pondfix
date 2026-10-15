// Single source of colour for the app. Screens and components use these semantic tokens, never raw HEX codes.
//
// Direction (shared with the web dashboard, see docs/DESIGN_SYSTEM.md): a warm off-white page, white cards with visible borders, deep teal
// for brand and primary actions, aquatic green for "healthy". Chosen for outdoor use: dark text on a light page keeps contrast high in
// bright sun, and status colours are never the only signal (every status also has an icon and a word).
//
// Contrast rules (checked against WCAG AA, see frontend/tests/design-tokens.test.ts):
//   * Body text (`textPrimary`, `textSecondary`) is at least 6:1 on the page and on cards.
//   * Status text uses the "*Dark" token on its tinted surface (at least 5.7:1).
//   * White text on the teal and critical fills is at least 6.3:1.
const palette = {
  teal: '#0F6B66',
  tealText: '#0C5D59',
  tealSoft: '#6FA59C',
  tealPale: '#E2F0EC',
  tealLine: '#CFE5E0',

  page: '#F6F4EE',
  white: '#FFFFFF',
  cardSecondary: '#FAF9F6',
  muted: '#EEECE5',
  hairline: '#DEDAD0',
  lineStrong: '#C5C0B3',
  divider: '#ECE9E1',

  ink: '#17282A',
  inkSecondary: '#4A5A5C',
  inkMuted: '#5B6A6C',

  healthy: '#2E7D4F',
  healthyText: '#1F6A3E',
  healthySurface: '#E5F3EA',
  warning: '#B86E00',
  warningText: '#8A4E00',
  warningSurface: '#FDF1DC',
  critical: '#C0392B',
  criticalText: '#A3271B',
  criticalSurface: '#FCEBE8',
  info: '#3D6F86',
  infoText: '#2C5A6E',
  infoSurface: '#E4EEF2',
  neutral: '#8E9A9B',
  unavailable: '#6B7778',

  water: '#2F7F8C',
  pondField: '#8FB5A8',
  pondEmbankment: '#D8D1BC',
} as const;

export const colors = {
  // Page and brand.
  background: palette.page,
  primary: palette.teal,
  primaryDark: palette.teal,
  primaryLight: palette.tealLine,
  primaryText: palette.tealText,
  primarySurface: palette.tealPale,
  topographicLine: palette.divider,
  topographicLineMuted: palette.divider,
  topographicBackground: palette.page,
  water: palette.water,
  pondField: palette.pondField,
  pondEmbankment: palette.pondEmbankment,

  // Surfaces. Cards are white with a visible border on the off-white page.
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceOverlay: palette.tealLine,
  card: palette.white,
  cardSecondary: palette.cardSecondary,
  cardMuted: palette.muted,
  inputBackground: palette.white,
  border: palette.hairline,
  divider: palette.divider,
  /** Border for controls that sit directly on the page. */
  borderOnBackground: palette.lineStrong,

  // Text. The page and cards are both light, so the same text tokens work on either.
  textPrimary: palette.ink,
  textSecondary: palette.inkSecondary,
  textMuted: palette.inkMuted,
  textOnBackground: palette.ink,
  textOnBackgroundSecondary: palette.inkSecondary,
  textOnBackgroundMuted: palette.inkMuted,
  // Text and icons on teal or status fills.
  textOnDark: palette.white,

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
  criticalOnBackground: palette.criticalText,
  info: palette.info,
  infoDark: palette.infoText,
  infoSurface: palette.infoSurface,
  neutral: palette.neutral,
  unavailable: palette.unavailable,

  // Buttons: teal fill is the primary action; pale teal the secondary.
  buttonPrimary: palette.teal,
  buttonPrimaryText: palette.white,
  buttonSecondary: palette.tealPale,
  buttonSecondaryText: palette.tealText,
  buttonOutline: palette.teal,
  buttonCritical: palette.criticalText,

  // Charts sit on white cards: teal line, faint grid, status colours only where data is in that state.
  chartLine: palette.teal,
  chartGrid: 'rgba(23, 40, 42, 0.10)',
  chartAxis: palette.inkSecondary,
  chartPrediction: palette.info,
  chartThresholdWarning: palette.warning,
  chartThresholdCritical: palette.critical,

  overlay: 'rgba(23, 40, 42, 0.5)',
  scrim: 'rgba(23, 40, 42, 0.5)',
  shadow: palette.ink,
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
