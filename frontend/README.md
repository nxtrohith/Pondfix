# AquaGuard frontend

Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS v4, with Recharts for charts, Phosphor icons and Geist type. It is a thin client of the AquaGuard REST API (`backend/`): it holds no database credentials, runs no model, and has no data of its own.

## Run (verified workflow)

The dashboard needs the API running. **Start the backend first, in its own terminal, then the frontend in a second one.** The dashboard does not start the API for you; if it is not running, every page shows "Could not reach the AquaGuard API".

| Step | Atlas (real data) | Isolated local database |
|---|---|---|
| 0. Install once | `npm install` (repo root) and `pip install -r ml/requirements.txt` | same |
| 1. Configure | repo-root `.env` with `MONGODB_URI` (see root README). The frontend needs no configuration for local development. | none |
| 2. Terminal 1: API | `npm start` | `npm run dev:local` (~20 s: starts an in-memory MongoDB and imports the historical CSVs from `~/Preprocess/csv`; data is discarded on exit) |
| 3. Check the API | `curl http://127.0.0.1:4000/api/health` should return `"status":"ok"` with `"database":{"status":"up"}` | same |
| 4. Terminal 2: dashboard | `npm run dev:frontend` | same |
| 5. Open | http://localhost:3000 (or http://127.0.0.1:3000) | same |
| 6. Stop | `Ctrl+C` in each terminal | same |

Use the local-database workflow for anything that writes (the Simulation page, acknowledging alerts): it never touches Atlas. Production build: `npm run build:frontend && npm run start -w frontend` (also http://localhost:3000).

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:4000/api` | API base URL used by the browser. Include the `/api` prefix; a trailing slash is ignored. Browser-safe values only. |
| `API_BASE_URL` | same as above | Optional server-side URL for Next.js server components |
| `NEXT_PUBLIC_DISPLAY_TIMEZONE` | `UTC` | IANA time zone for displayed timestamps (data is stored in UTC) |

Put overrides in `frontend/.env.local` (git-ignored) and restart `npm run dev:frontend`; `NEXT_PUBLIC_*` values are fixed at build time. The API accepts browser requests only from `CORS_ORIGINS` (default: `localhost` and `127.0.0.1` on ports 3000, 5173 and 8081).

### Hackathon demo: the alert lifecycle

1. **Terminal 1:** `npm run dev:local` and wait for `AquaGuard API listening ... (database: LOCAL ...)`. Do not run `npm start` at the same time: both use port 4000, and `npm start` connects to Atlas.
2. **Check it is isolated:** `curl http://127.0.0.1:4000/api/health` must show `"database":{"status":"up","target":"local"}`.
3. **Terminal 2:** `npm run dev:frontend`, then open http://localhost:3000.
4. Open **Alerts** in one browser tab (it should say "No unresolved alerts") and **Simulation** in another.
5. In Simulation, under **Guided alert demo**, pick a pond and press **Start demo**, then confirm. Four simulated readings go out 5 seconds apart:

| Time | Dissolved oxygen | What the server does |
|---|---|---|
| T+0 s | 3.5 mg/L | Normal, no alert |
| T+5 s | 2.5 mg/L | Opens a WARNING alert |
| T+10 s | 1.5 mg/L | Escalates the same alert to CRITICAL (no duplicate) |
| T+15 s | 3.5 mg/L | Resolves the alert; it stays in history |

6. After each step, refresh the Alerts tab (or press the refresh button) to see the state change. The demo table and the "Alerts for this pond" list below it show the server's actual responses and the alert's ID.
7. To show acknowledgement: after step 2 or 3, press **Acknowledge** on the Alerts page. The alert becomes Acknowledged but stays unresolved until a normal reading arrives.
8. Stop both terminals with `Ctrl+C`. Everything written is discarded.

The Guided demo is **disabled unless the API reports a local database** (`database.target` is `local`). Against Atlas it shows why and tells you to use `npm run dev:local`. If a step fails, the sequence pauses on that step; **Retry step N** re-sends the same reading and nothing is skipped.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every page says "Could not reach the AquaGuard API" and the sidebar says "API unreachable" | The backend is not running, or is on another port. Run `curl http://127.0.0.1:4000/api/health`. If it is refused, start it with `npm start` (or `npm run dev:local`). If it uses another `PORT`, set `NEXT_PUBLIC_API_BASE_URL` and `API_BASE_URL` to match. |
| Pages load but charts, forecasts, Alerts or Simulation never fill in | Browser-side requests are blocked. Open the dashboard as `http://localhost:3000` or `http://127.0.0.1:3000`; for any other host (for example a LAN address) add its origin to the API's `CORS_ORIGINS` and, for `next dev`, to `allowedDevOrigins` in `next.config.ts`. |
| Health shows "Degraded", forecasts say "unavailable" | The API is up but the Python worker is not: install `ml/requirements.txt` (scikit-learn 1.8.0) and check `PYTHON_BIN`. Measurements and alerts keep working. |
| Health shows the database as unreachable, or the API exits at start-up | `MONGODB_URI` is missing or wrong, or your IP is not allowed in Atlas Network Access. The API prints a sanitized error. |
| "The API returned a response in an unexpected format" | The frontend and backend versions differ. Update both and restart. |
| "The demo is disabled" on the Simulation page, or an alert you did not expect on the dashboard | The API on port 4000 is connected to Atlas (it was started with `npm start`). Check `curl http://127.0.0.1:4000/api/health`: `"target":"remote"` means Atlas. Stop that process and start `npm run dev:local`. |
| `FATAL: port 4000 is already in use` | Another AquaGuard API is running. Find it with `lsof -nP -iTCP:4000 -sTCP:LISTEN`, check what it is connected to, then stop it with `Ctrl+C` in its terminal. |
| Everything shows "Stale" | Expected: the imported data ends in January 2026, so it is historical, not live. |

## Pages

| Route | What it shows | API used |
|---|---|---|
| `/` Overview | KPI cards, recent trend chart (pond, parameter and range selectable), pond-health distribution, pond monitoring table, recent unresolved alerts | `/ponds`, `/ponds/:id/summary` (per pond), `/alerts`, `/risk-rules`, `/ponds/:id/measurements` |
| `/ponds` | Searchable, filterable pond directory (also reached from the top-bar search: `/ponds?q=`) | `/ponds`, `/ponds/:id/summary` |
| `/ponds/[id]` | Latest values with source and age, measurement history, latest forecast, alert history, metadata | `/ponds/:id`, `/summary`, `/measurements`, `/predictions`, `/alerts`, `/risk-rules` |
| `/forecasts` | Pond and parameter selection, recorded readings next to model forecasts, forecast table | `/ponds/:id/predictions`, `/measurements`, `/risk-rules` |
| `/alerts` | Severity counts, filters, expandable details, acknowledge, load more | `/alerts`, `PATCH /alerts/:id/acknowledge` |
| `/analytics` | Dissolved oxygen, pH and water temperature for a pond, each in its own section with observations, average, minimum, maximum, change and a chart; multi-pond comparison of all three | `/ponds/:id/analytics` and `/analytics/compare` (one request per parameter) |
| `/simulation` | (1) Manual simulated reading: DO, pH and temperature (presets or custom, each optional) sent as ONE request, with preview, confirmation and the raw server response. (2) Guided alert demo: four DO-only readings. Both are enabled only when the API reports a local database. | `/demo/scenarios`, `/health`, `POST /demo/measurement` |
| `/health` | API, database and forecasting-service status, data freshness, risk rules in use | `/health`, `/ponds/:id/summary`, `/risk-rules` |

All requests go through one typed client (`src/lib/api/client.ts`) whose zod schemas (`schemas.ts`) validate every response. Failures surface as `ApiError` with a kind (`network`, `timeout`, `http`, `invalid`, `aborted`), and the UI shows an error state with Retry; there is no mock-data fallback.

## Data-integrity rules the UI follows

- **Backend owns the rules.** Risk status, staleness and alert state come from the API. The DO thresholds drawn on charts and quoted in text are read from `GET /api/risk-rules`, not hard-coded. Overview counts are computed from the per-pond `riskStatus` the API returns and reconcile to the total.
- **Missing is not healthy; stale is not current.** No data shows "No data" or `n/a`. Readings older than the API's stale window show "Stale". Historical records show "Historical replay" with their age (currently "8 months ago").
- **Sources are always labelled** (Historical replay, Simulated, Live sensor). Charts draw simulated readings as separate markers, never inside the recorded line. A forecast generated from a simulated reading is labelled as such.
- **Charts never interpolate.** A gap in readings is a gap in the line; hourly or daily buckets omit empty buckets.
- **Forecasts are not measurements.** Only the API's real fields are shown. "Typical error" is the model's validation-period median absolute error and is labelled as not a confidence interval. No confidence scores are shown.
- **Acknowledge is not resolve.** Acknowledging keeps the alert open; the UI says so and counts it as unresolved.
- **Mutations are explicit.** The only writes are Acknowledge and the Simulation confirmation dialog. Loading, refreshing or navigating never submits anything.

## Design system

Tokens live in `src/app/globals.css` (`@theme`). Light theme only: ivory canvas, white cards with pale sage outlines, one sage/olive accent, semantic amber and muted red only for real status. Shape rule: cards 12px, controls 8px, pills fully round. Geist (via `next/font`, self-hosted), Phosphor icons at one weight, no gradients, no shadows beyond the chart tooltip, motion limited to short colour transitions and honouring `prefers-reduced-motion`.

**Contrast adjustment.** The specified secondary text `#77796F` and the warning, critical and stale pill text colours measure 3.7 to 4.4 against their backgrounds, below WCAG AA (4.5:1) for small text. The exact specified swatches are kept for surfaces, borders, icons and chart strokes; small text uses slightly darker tokens of the same hue (`ink-soft #6A6C62`, `warn-text #8E5A1A`, `crit-text #A5433A`, `stale-text #5E6057`, `ok-text #476A41`, `olive-text #52684A`), all at 4.5:1 or better.

## Structure

```
src/app/            routes (server components fetch; each exports dynamic = 'force-dynamic')
src/components/
  shell/            app shell, sidebar, mobile drawer, top bar, refresh context
  ui/               card, KPI card, status pill, table, form fields, states, dialog
  charts/           TrendChart (Recharts), DistributionBar
  features/         client workspaces: trend, forecasts, alerts, analytics, simulation, tables
src/lib/            api client + schemas, formatting, status maps, fleet aggregation, chart and simulation helpers
tests/              Vitest + Testing Library
```

Interactive parts are client components; pages themselves are server components, so the first paint already contains data. `useApiQuery` aborts superseded requests so a slow response for a previous pond or parameter can never overwrite the current one.

## Quality checks

```bash
npm run lint -w frontend         # ESLint (next + React hooks rules)
npm run typecheck -w frontend    # tsc --noEmit, strict
npm test -w frontend             # Vitest: API client errors/timeouts/aborts, formatting, chart gap handling, fleet counts, simulation validation, components
npm run build -w frontend
```

## API gaps found

The frontend only uses endpoints that exist. Limitations that follow from the current API:

- **No fleet-wide summary endpoint**, so Overview, Ponds and others fetch one `/ponds/:id/summary` per pond (8 at a time). Fine for 17 ponds; a single aggregate endpoint would be better for hundreds.
- **List endpoints return a page count, not a total**, so unresolved-alert totals above 200 show as "200+" (Overview) or are counted up to 1000 (Alerts).
- **Alert severity and parameter filters are applied client-side** to the loaded alerts; status, pond and type filter on the server.
- **`/health` does not report the last successful forecast.** System Health derives "latest forecast stored" from pond summaries.
- **No pond metadata** (species, location, area) exists for the imported ponds, so those fields show "Not recorded".
- **No way to delete simulated data.** The confirmation dialog says so.
- **`GET /api/risk-rules` was added to the backend** so the UI does not duplicate thresholds.
- **No read-only inference endpoint.** Forecasts are only created as part of writing a measurement (`POST /api/measurements` or the demo endpoint), so forecasts for the imported ponds appear only after a simulation. The worker itself was verified separately against real stored history without writing anything.
- **Dev mode logs a cancelled request.** In `next dev`, React StrictMode runs effects twice and the first chart request is cancelled by design (`net::ERR_ABORTED`). It is not an error and does not occur in production builds.

## Simulation: historical replay

The Simulation page opens on **Historical replay** (the existing test-reading form is under the "Test reading" tab). Pick a pond and a
24 h / 7 d preset (offered only when enough real records exist) or a custom UTC range, then Start/Pause/Stop/Reset or seek. Replay is
read-only and works against any database target. Code: `components/features/HistoricalReplay.tsx`, `lib/replay.ts`.
