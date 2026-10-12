# AquaGuard mobile app (demo)

A React Native + Expo (SDK 57, Expo Router) farmer app. It lives entirely in `mobile-app/`, is isolated from the web app and backend, and uses **local demo data only**. It does not call the AquaGuard API or MongoDB.

## Run

```bash
cd mobile-app
npm install --legacy-peer-deps   # see note below
npm start                        # Expo dev server; open in Expo Go or a simulator
npm run android | npm run ios    # launch a platform workflow
```

`--legacy-peer-deps` is needed because an optional `react-dom` peer of `@expo/devtools` conflicts with `react` 19.2.3 in this project.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (eslint-config-expo)
npm test            # jest (jest-expo preset, React Native Testing Library 13)
npm run test:watch
```

## Structure

- `src/app/` — routes (Expo Router). `_layout.tsx` wraps everything in the local store.
- `src/components/` — shared components (status badges, metric and pond cards, alert cards, line chart, buttons, forms).
- `src/constants/` — `colors.ts` (the only place with colour values) and `theme.ts` (spacing, radius, type).
- `src/lib/` — water-quality classification, pond summaries and counts, form validation, chart maths, formatting.
- `src/data/` — typed demo data: four ponds (Pond 1–4), readings, alerts, forecasts, notifications, species, profile.
- `src/context/AppStore.tsx` — in-memory state for local interactions. Nothing is persisted.
- `tests/` — unit, component, and navigation tests (navigation uses the real route files).

## Status rules

Thresholds are the backend's provisional general rules (`backend/src/services/risk.js`): DO warning below 3.0 mg/L and critical below 2.0; pH 6.5–8.5 acceptable, critical beyond 6.0 / 9.0; temperature 20–32 °C acceptable, critical beyond 15 / 35. A reading older than 60 minutes is "Not recent". A missing or offline sensor is "Unavailable". **A pond is healthy only when every reading is current and in range.** Acknowledging an alert never resolves it.

## What is demo or not yet built

- All readings, alerts, forecasts, notifications, species information and profile data are illustrative. Forecasts are **not** from the AquaGuard forecasting model.
- No sign-in: "Log in" continues to the demo farm on this device.
- No push, SMS, WhatsApp or background alerts. Notification and alert settings only change this app's preferences.
- Language selection is saved but the app text is English only.
- Pond photos are vector illustrations, since no licensed photography is bundled. App icons are Expo template placeholders.
- "Other / custom" species is not offered in the pond form because it needs a name field that is not built yet.
