// Spacing, radius, type scale and elevation. One scale for the whole app: screens use these tokens instead of raw numbers.

/** 4-point scale: 4, 8, 12, 16, 24, 32, 40, 48, 64. */
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48, huge: 64 } as const;

/** Restrained radii. Pills are for calls to action, compact controls and status chips only; cards stay at `card`. */
export const radius = { badge: 8, chip: 12, control: 12, card: 12, cardLarge: 18, pill: 999 } as const;

/**
 * Type scale. Display 36-48, H1 30-36, H2 24-28, H3 18-22, body 15-17, caption 12-14.
 * `display` is the landing title; `heading` is a screen title; `sectionHeading` and `cardHeading` are the H2 and H3 steps.
 */
export const fontSize = {
  display: 48,
  heading: 30,
  sectionHeading: 22,
  cardHeading: 18,
  measurement: 24,
  body: 15,
  secondary: 13,
  metadata: 12,
} as const;

export const layout = {
  screenPaddingX: spacing.md,
  cardPadding: spacing.md,
  minTouchTarget: 44,
  bottomNavHeight: 64,
  borderWidth: 0.5,
  /** Content stops growing at this width, so a tablet shows a centred phone-width column instead of stretched cards. */
  maxContentWidth: 560,
} as const;

/** Elevation. Barely-there depth: low opacity, a small offset and a soft blur, in the palette's own olive, never a black drop shadow. */
export const shadow = {
  none: {},
  card: { shadowColor: '#2F3A27', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 1 },
  button: { shadowColor: '#2F3A27', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 2 },
} as const;
