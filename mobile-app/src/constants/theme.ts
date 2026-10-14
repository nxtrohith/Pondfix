// Spacing, radius and type scale from the design brief. Values are starting points that match the reference.
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;

export const radius = { badge: 8, chip: 12, card: 16, cardLarge: 18, pill: 24, control: 12 } as const;

export const fontSize = {
  splash: 32,
  heading: 26,
  sectionHeading: 20,
  cardHeading: 16,
  measurement: 24,
  body: 14,
  secondary: 12,
  metadata: 11,
} as const;

export const layout = {
  screenPaddingX: 18,
  cardPadding: 16,
  minTouchTarget: 44,
  bottomNavHeight: 66,
  borderWidth: 0.5,
} as const;
