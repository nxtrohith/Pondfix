# AquaGuard mobile app (demo)

A React Native + Expo (SDK 57, Expo Router) farmer app. It lives entirely in `mobile-app/`, is isolated from the web app and backend, and uses **local demo data only**. It does not call the AquaGuard API or MongoDB.

## Prerequisites

- **Node.js** and npm. The project was built and tested with Node 25 and npm 11.
- **To run on a phone:** the **Expo Go** app (App Store or Play Store). Use a current version, since this project targets Expo SDK 57.
- **To run in a simulator (optional):** Xcode for iOS, or Android Studio for Android.

## Setup

```bash
cd mobile-app
npm install --legacy-peer-deps
```

Run `npm install` with `--legacy-peer-deps` every time you reinstall, not just the first time. An optional `react-dom` peer of `@expo/devtools` conflicts with `react` 19.2.3, and the flag works around it. Skip this step if `node_modules/` is already present and up to date.

## Start the app

```bash
npm start
```

This starts the Expo dev server and prints a QR code in the terminal. Then open the app one of these ways:

- **Phone (Expo Go):** keep the phone on the same Wi-Fi as your computer, open Expo Go, and scan the QR code. If scanning fails because the network blocks local connections, stop the server and run `npx expo start --tunnel` instead.
- **iOS simulator:** press `i` in the Expo terminal, or run `npm run ios`.
- **Android emulator:** press `a` in the Expo terminal, or run `npm run android`.
- **Web browser:** run `npm run web`, then open the URL it prints (usually http://localhost:8081). The web build needs `react-native-web` and `react-dom`, which are already in `package.json`. If you ever see "don't have the required dependencies installed", run `npx expo install react-native-web react-dom`.

The app opens on the splash screen. Tap **Get Started** (or **Log in**, then **Continue to demo**) to reach the dashboard. There is no real sign-in.

## Checks

```bash
npm run typecheck   # TypeScript (tsc --noEmit)
npm run lint        # ESLint (eslint-config-expo)
npm test            # Jest: unit, component and navigation tests (137 tests)
npm run test:watch  # Jest in watch mode while developing
```

## Troubleshooting

- **`npm install` fails with a peer-dependency error:** use `npm install --legacy-peer-deps`.
- **`npm install` fails with `EACCES` on `~/.npm`:** the global npm cache has files owned by root. Fix the ownership (`sudo chown -R "$(whoami)" ~/.npm`) or point npm at a private cache, for example `npm_config_cache=/some/private/dir npm install --legacy-peer-deps`.
- **Expo Go says the project needs a different SDK version:** update Expo Go to the latest release.
- **The phone can't connect to the dev server:** check that both devices are on the same network, or use `npx expo start --tunnel`.
- **Stale code or a broken bundle after a change:** restart with `npx expo start --clear`.

## Structure

- `src/app/` — routes (Expo Router). `_layout.tsx` wraps everything in the local store.
- `src/components/` — shared components (status badges, metric and pond cards, alert cards, line chart, buttons, forms).
- `src/constants/` — `colors.ts` (the only place with colour values) and `theme.ts` (spacing, radius, type).
- `src/lib/` — water-quality classification, pond summaries and counts, form validation, chart maths, formatting.
- `src/data/` — typed demo data: four ponds (Pond 1–4), readings, alerts, forecasts, notifications, species, profile.
- `src/context/AppStore.tsx` — in-memory state for local interactions. Nothing is persisted.
- `tests/` — unit, component and navigation tests. Navigation tests render the real route files.

## Status rules

Thresholds are the backend's provisional general rules (`backend/src/services/risk.js`):

- **Dissolved oxygen:** warning below 3.0 mg/L, critical below 2.0 mg/L.
- **pH:** 6.5–8.5 is acceptable, critical beyond 6.0 or 9.0.
- **Temperature:** 20–32 °C is acceptable, critical beyond 15 or 35 °C.

A reading older than 60 minutes is "Not recent". A missing or offline sensor is "Unavailable". **A pond is healthy only when every reading is current and in range.** Acknowledging an alert never resolves it.

## What is demo or not yet built

- All readings, alerts, forecasts, notifications, species information and profile data are illustrative. Forecasts are **not** from the AquaGuard forecasting model.
- No sign-in: "Log in" continues to the demo farm on this device.
- No push, SMS, WhatsApp or background alerts. Notification and alert settings only change this app's preferences.
- Language selection is saved but the app text is English only.
- Pond photos are vector illustrations, since no licensed photography is bundled. App icons are Expo template placeholders.
- "Other / custom" species is not offered in the pond form, because it needs a name field that is not built yet.
- Data lives in memory. Edits, acknowledgements and settings reset when the app reloads.
