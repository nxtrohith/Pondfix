// Single source of colour for the app. Values come from the AquaGuard mobile design brief. Screens and components must use these
// semantic tokens, never raw HEX codes.
const palette = {
  olive: '#5C624E',
  forestDeep: '#30392C',
  forestDark: '#252D23',
  forest: '#343D30',
  forestElevated: '#424B3B',
  forestOverlay: '#4B5443',
  contour: '#929783',
  contourMuted: '#7C836F',

  warmWhite: '#F6F4EA',
  warmWhiteSecondary: '#EAE8DE',
  warmWhiteMuted: '#DEDFD3',
  warmInput: '#EEECE2',
  warmBorder: '#D3D4C7',
  warmDivider: '#D9D9CE',

  ink: '#171B16',
  inkSecondary: '#686B60',
  inkMuted: '#858779',
  onDark: '#F7F6EE',
  onDarkSecondary: '#D8DBCF',
  onDarkMuted: '#ADB3A2',

  healthy: '#4DAE69',
  healthyDark: '#347E49',
  healthySurface: '#DDF0DD',
  warning: '#F19A32',
  warningDark: '#C87918',
  warningSurface: '#FFF0D8',
  critical: '#E64B45',
  criticalDark: '#BD3834',
  criticalSurface: '#FBE4E1',
  info: '#70B4F0',
  infoDark: '#397DB7',
  infoSurface: '#E1EFFB',
  neutral: '#969B8B',
  unavailable: '#777E6D',
} as const;

export const colors = {
  background: palette.olive,
  backgroundDeep: palette.forestDeep,
  backgroundDark: palette.forestDark,
  surface: palette.forest,
  surfaceElevated: palette.forestElevated,
  surfaceOverlay: palette.forestOverlay,
  topographicLine: palette.contour,
  topographicLineMuted: palette.contourMuted,
  topographicBackground: palette.olive,

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
  textOnDarkMuted: palette.onDarkMuted,

  healthy: palette.healthy,
  healthyDark: palette.healthyDark,
  healthySurface: palette.healthySurface,
  warning: palette.warning,
  warningDark: palette.warningDark,
  warningSurface: palette.warningSurface,
  critical: palette.critical,
  criticalDark: palette.criticalDark,
  criticalSurface: palette.criticalSurface,
  info: palette.info,
  infoDark: palette.infoDark,
  infoSurface: palette.infoSurface,
  neutral: palette.neutral,
  unavailable: palette.unavailable,

  buttonPrimary: palette.warmWhite,
  buttonPrimaryText: palette.ink,
  buttonSecondary: palette.forest,
  buttonSecondaryText: palette.onDark,
  buttonOutline: palette.warmBorder,
  buttonCritical: palette.critical,

  // Chart colours (muted; status colours are used only where data is in that state).
  chartLine: palette.onDark,
  chartGrid: 'rgba(247, 246, 238, 0.14)',
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
