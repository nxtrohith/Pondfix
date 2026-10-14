// Visual tokens for PondFix Vision. Same palette as the PondFix mobile app (sage page, ivory surfaces, deep olive emphasis), so the two apps
// read as one product. Kept here, not shared by import, because this is a separate Expo project.
//
// Contrast: text on the sage page uses `textOnBackground*`; `textSecondary` / `textMuted` are for ivory surfaces only.

export const colors = {
  background: '#A8B889',
  surface: '#F4F4E8',
  surfaceElevated: '#FAFAF2',
  primary: '#71845A',
  primaryDark: '#46543A',
  primaryLight: '#CBD5AE',
  border: '#D5DAC4',
  divider: '#E1E5D2',
  borderOnBackground: 'rgba(70, 84, 58, 0.55)',

  textPrimary: '#1E241B',
  textSecondary: '#66705C',
  textMuted: '#5F6954',
  textOnBackground: '#1E241B',
  textOnBackgroundSecondary: '#36422D',
  textOnDark: '#F4F4E8',

  success: '#4F7D45',
  successDark: '#2F5A2B',
  successSurface: '#DFE9D0',
  warning: '#B9791E',
  warningDark: '#7A4A0C',
  warningSurface: '#F6E7C6',
  critical: '#A6443A',
  criticalDark: '#86312A',
  criticalSurface: '#F2DAD3',
  neutral: '#8A917B',

  /** The camera preview itself and the dimming over it. */
  video: '#1E241B',
  videoScrim: 'rgba(30, 36, 27, 0.45)',
  shadow: '#2F3A27',
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export const radius = { badge: 8, control: 12, card: 12, cardLarge: 18, pill: 999 } as const;
export const fontSize = { heading: 28, section: 20, body: 15, secondary: 13, caption: 12, stat: 32 } as const;

export const shadow = {
  card: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 1 },
  button: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 2 },
} as const;

/**
 * One colour per behaviour, used for the boxes over the video, the legend dots and the counts. Mid-tones, so they show on both dark water
 * and ivory. `BEHAVIOUR_TEXT` is the darker variant for words set on ivory (4.5:1).
 */
export const BEHAVIOUR_COLOUR: Record<string, string> = {
  ACTIVE: '#5F9E4A',
  LOW_ACTIVITY: '#D9A032',
  POSSIBLY_MOTIONLESS: '#C8503C',
  TRACKING_UNCERTAIN: '#8C9380',
  UNKNOWN: '#5E98A6',
};
export const BEHAVIOUR_TEXT: Record<string, string> = {
  ACTIVE: '#2F5A2B',
  LOW_ACTIVITY: '#7A4A0C',
  POSSIBLY_MOTIONLESS: '#86312A',
  TRACKING_UNCERTAIN: '#4F5645',
  UNKNOWN: '#2F5D69',
};
