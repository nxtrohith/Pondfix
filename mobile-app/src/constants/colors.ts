// Single source of colour for the app. Values come from the AquaGuard mobile design brief. Screens and components must use these
// semantic tokens, never raw HEX codes.
// Palette from the design brief. Fills, icons and borders use the brief's colours (3:1 is enough for non-text).
// Text on a pale surface uses a darker variant of the same hue (the "*Dark" tokens), so it meets WCAG AA 4.5:1.
const palette = {
  olive: '#5B624D',
  forestDeep: '#30392C',
  forestDark: '#252D23',
  forestElevated: '#424B3B',
  forestOverlay: '#4B5443',
  contour: '#929783',
  contourMuted: '#7C836F',
  water: '#4A7B8C',

  warmWhite: '#F5F3E8',
  warmWhiteSecondary: '#EAE8DE',
  warmWhiteMuted: '#E4E2D6',
  warmInput: '#EEECE2',
  warmBorder: '#D3D4C7',
  warmDivider: '#D9D9CE',

  ink: '#191D18',
  inkSecondary: '#696D61',
  inkMuted: '#686B60',
  onDark: '#F7F6EF',
  onDarkSecondary: '#D8DBCF',

  healthy: '#2F804B',
  healthyText: '#22693C',
  healthySurface: '#DDEFD9',
  warning: '#C87513',
  warningText: '#8A4B0A',
  warningSurface: '#FFF0D5',
  critical: '#C63832',
  criticalText: '#A82B25',
  criticalSurface: '#FBE3E0',
  info: '#347DB8',
  infoText: '#2A6496',
  infoSurface: '#E0EFFB',
  neutral: '#969B8B',
  unavailable: '#777E6D',
} as const;

export const colors = {
  background: palette.olive,
  backgroundDeep: palette.forestDeep,
  backgroundDark: palette.forestDark,
  surface: palette.forestDeep,
  surfaceElevated: palette.forestElevated,
  surfaceOverlay: palette.forestOverlay,
  topographicLine: palette.contour,
  topographicLineMuted: palette.contourMuted,
  topographicBackground: palette.olive,
  water: palette.water,
  pondField: '#7D8A6E',
  pondEmbankment: '#B9B393',

  card: palette.warmWhite,
  cardSecondary: palette.warmWhiteSecondary,
  cardMuted: palette.warmWhiteMuted,
  inputBackground: palette.warmInput,
  border: palette.warmBorder,
  divider: palette.warmDivider,

  textPrimary: palette.ink,
  textSecondary: palette.inkSecondary,
  textMuted: palette.inkMuted,
  textOnDark: palette.onDark,
  textOnDarkSecondary: palette.onDarkSecondary,
  textOnDarkMuted: palette.onDarkSecondary,

  healthy: palette.healthy,
  healthyDark: palette.healthyText,
  healthySurface: palette.healthySurface,
  warning: palette.warning,
  warningDark: palette.warningText,
  warningSurface: palette.warningSurface,
  critical: palette.critical,
  criticalDark: palette.criticalText,
  criticalSurface: palette.criticalSurface,
  info: palette.info,
  infoDark: palette.infoText,
  infoSurface: palette.infoSurface,
  neutral: palette.neutral,
  unavailable: palette.unavailable,

  buttonPrimary: palette.warmWhite,
  buttonPrimaryText: palette.ink,
  buttonSecondary: palette.forestDeep,
  buttonSecondaryText: palette.onDark,
  buttonOutline: palette.warmBorder,
  buttonCritical: palette.critical,

  // Chart colours (muted; status colours are used only where data is in that state).
  chartLine: palette.onDark,
  chartGrid: 'rgba(25, 29, 24, 0.12)',
  chartAxis: palette.inkSecondary,
  chartPrediction: palette.info,
  chartThresholdWarning: palette.warning,
  chartThresholdCritical: palette.critical,

  // Dimming behind modal sheets.
  scrim: 'rgba(25, 30, 22, 0.55)',
} as const;

/** Opacity system for overlays, dividers and muted states. */
export const opacity = {
  topographic: 0.16,
  overlay: 0.5,
  divider: 0.12,
  muted: 0.6,
  disabled: 0.45,
} as const;

export type ColorToken = keyof typeof colors;
