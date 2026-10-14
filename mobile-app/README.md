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

- `src/app/` — routes (Expo Router). `_layout.tsx` wraps everything in the local store; `(tabs)/` holds the five top-level destinations.
- `src/components/` — shared components (status badges, metric and pond cards, alert cards, line chart, buttons, forms).
- `src/constants/` — `colors.ts` (the only place with colour values) and `theme.ts` (spacing, radius, type).
- `src/lib/` — water-quality classification, pond summaries and counts, form validation, chart maths, formatting.
- `src/data/` — typed demo data: four ponds (Pond 1–4), readings, alerts, forecasts, notifications, species, profile.
- `src/context/AppStore.tsx` — in-memory state for local interactions. Nothing is persisted.
- `tests/` — unit, component and navigation tests. Navigation tests render the real route files.

## Navigation

- **Top-level destinations:** Home, Ponds, Alerts, Species and Profile live in the `src/app/(tabs)/` route group. They are paged horizontally by a native pager (`TopTabs` from `expo-router/js-top-tabs`, using `react-native-pager-view`).
- **Swipe:** swipe left to move to the next destination and right to move back, in the bottom-bar order. Swiping does not wrap around at either end. The order is defined once in `src/lib/tabs.ts`.
- **Bottom bar:** the same bar as before, rendered below the pager. Tapping a tab animates to that page. The highlighted tab follows the URL, so swipes, taps and deep links all agree.
- **Detail pages** (pond details, charts, forecast, alert details and so on) are stack screens outside the group. They keep their own back navigation and show the bottom bar as before.
- **Reduced motion:** when the system asks for reduced motion, page transitions are turned off.

**Not checked on a device yet:** the native swipe itself, including how it interacts with the horizontal species chip list. The headless browser runs only the web fallback, where a short drag moves one page and a fast drag can move two.

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

## Live data

Ponds, readings, charts, forecasts and alerts come from the AquaGuard backend; nothing is simulated in the app.
Only the farmer profile and the species reference catalogue are local.

- Backend address: `EXPO_PUBLIC_API_URL` in `.env.local` (see `.env.example`). Use the computer's LAN IP, never `localhost`.
- The backend must listen on the network: `HOST=0.0.0.0` in `backend/.env`.
- Sync model: `GET /api/ponds/summaries` (one server-stamped snapshot per pond), `GET /api/alerts`, then Socket.IO events
  `pond:reading_updated`, `pond:updated`, `pond:forecast_updated`, `alert:new`, `alert:updated`, `alert:resolved`.
  A client applies a pond snapshot only if it is newer than the one it holds, so duplicates and out-of-order delivery are harmless.
  Events are not replayed: every (re)connect and every return to the foreground refetches.

### Tests

`npm test` (no server needed) and `npm run test:e2e` (opt-in, needs a backend on an isolated database):

```bash
AQUAGUARD_E2E_FILE=/path/to/e2e.json npm run test:e2e   # {"base":"http://127.0.0.1:PORT","ponds":[17 pond ids]}
```

### Reading the logs

Every diagnostic line is `HH:MM:SS.mmm [TAG] message`. In development it appears in the **Metro terminal** (the one running
`npx expo start`); Expo forwards `console.*` from the phone to that terminal over a websocket, in development mode only, and
not with `--no-dev`. The same lines are always kept on the phone: **Settings → Connection diagnostics**, or tap the
connection banner on any screen. That screen also shows the server address, the live-connection state, the REST state and the
pond/alert counts.

| Tag | Meaning | Examples |
| --- | --- | --- |
| `[APP]` | Lifecycle | `AquaGuard mobile starting`, `app state -> active` |
| `[CONFIG]` | Server address | `server address http://172.16.19.138:4000`, `The server address is not valid` |
| `[REST]` | Each request | `GET /ponds/summaries -> 200 in 412ms`, `GET /alerts failed after 83ms: Network request failed` |
| `[SOCKET]` | Realtime connection | `connecting to …`, `connected … via websocket`, `connect_error #2 …: xhr poll error` |
| `[SYNC]` | Data synchronisation | `ponds received=17; with readings=17`, `ponds stored=17`, `alerts received: active=1 resolved=0` |
| `[POND]` | Reading/pond events | `pond:reading_updated received: pond=… latest=[temperature]`, `ignored stale or duplicate snapshot` |
| `[ALERT]` | Alert events | `alert:new received: … WARNING ACTIVE`, `stored …` |
| `[UI]` | What a screen renders | `pond list rendering 17 of 17 ponds` |

The backend prints one `[INGEST]` line per accepted reading in **its** terminal, saying what monitoring decided for each parameter
(`safe, no alert`, `alert opened`, `same condition still open: deduplicated`, `not evaluated: a newer reading … exists`).
Secrets, tokens and response bodies are never logged; credentials inside URLs are redacted.
