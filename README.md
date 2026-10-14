# PondFix

**Early-warning monitoring for commercial aquaculture ponds.** PondFix ingests water-quality telemetry (dissolved oxygen, pH, temperature), classifies every reading against risk rules, keeps a persistent alert lifecycle, and forecasts conditions up to 3 hours ahead with a hash-pinned machine-learning model. Operators see it all in a web dashboard with a 3D digital twin of the farm, and farmers use a mobile app.

The system manages 17 ponds, **Pond 1** through **Pond 17**, and includes read-only replay of 72,750 historical observations from a Fish Welfare Initiative monitoring campaign.

> [!IMPORTANT]
> PondFix is **not production-ready for public exposure**. It has no authentication, and the risk thresholds for pH and temperature are provisional demo values. Read [Security](#security) and [Known limitations](#known-limitations) before using it with real fish.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [REST API](#rest-api)
- [Realtime events](#realtime-events)
- [Risk rules and alert lifecycle](#risk-rules-and-alert-lifecycle)
- [Forecasting engine](#forecasting-engine)
- [Data model](#data-model)
- [Testing](#testing)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Further documentation](#further-documentation)
- [Data attribution](#data-attribution)

---

## Features

### Monitoring and ingestion

- **Multi-parameter telemetry.** Each reading carries up to four values: dissolved oxygen (mg/L), pH, water temperature (°C), and water level (m). Water level is stored and displayed but not classified.
- **Channel isolation.** A bad sensor value (for example pH `99`) is rejected and reported in `rejectedValues`, while valid sibling values in the same reading are still processed.
- **Idempotent ingestion.** An optional `idempotencyKey` makes retries safe: a repeated request returns `200` and changes nothing.
- **Stale-data detection.** A reading older than `STALE_AFTER_MINUTES` (default 60) is reported as `STALE`. Missing or old data is never shown as healthy.
- **Out-of-order protection.** A late reading never resurrects or resolves an alert. A parameter's alert state comes only from its newest reading.
- **Per-pond data source.** Each pond is marked as reading from a `sensor` or a `simulator`, set with `PATCH /api/ponds/:id/data-source` or for all ponds at once with `PATCH /api/ponds/data-source`.

### Risk evaluation and alerts

- **Strict, rule-driven classification.** Each parameter is evaluated independently against `NORMAL`, `WARNING`, and `CRITICAL` bands. Limits live in one place on the backend, and clients read them from `GET /api/risk-rules`.
- **Persistent alert lifecycle.** There is one open alert per pond, parameter, side, and data source. Alerts escalate from `WARNING` to `CRITICAL` in place, can be acknowledged by an operator, and resolve automatically when the water recovers. Resolved alerts stay as history.
- **Predictive alerts.** Forecast values for dissolved oxygen can open a *predicted* alert before the condition happens. These are labelled `FORECAST (not observed)`.
- **Species-aware messaging.** Each alert names the pond's species and says whether the general safety rules or an approved species policy applied.
- **Parameter couplings and downstream risks.** Rules of thumb link parameters (for example, low oxygen and high temperature together). `GET /api/ponds/:id/downstream-risks` lists likely knock-on effects from the pond's latest readings. This is information only: it never creates, changes, or resolves an alert.
- **What-if playground.** `POST /api/what-if` classifies hypothetical conditions and says what to watch for. It is pure computation and writes nothing.

### Alert advisor (optional)

- **Advice on each new or escalated alert.** The advisor builds its facts in code (status, exceedance, trend, recent readings, other open alerts, recent farmer notes), then asks an external model (Jev) for urgency, first actions, a possible sensor fault, and whether other alerts share a cause.
- **Bounded answers.** A policy layer caps the model's answers. A `CRITICAL` parameter never drops below a `WARNING` one, and a sensor-fault suspicion never hides an alert.
- **Solution text.** For an observed `CRITICAL` alert, a custom OpenAI-compatible LLM (if `LLM_ENDPOINT_URL` is set) drafts advice, and Jev checks it before it is shown.
- **Farmer field notes.** Farmers can log observations such as "fish gulping at the surface" on a pond (`GET`/`POST /api/ponds/:id/notes`). Jev classifies each note. Notes inform the advisor and never change an alert.
- **Off by default.** The advisor runs only when `JEV_API_KEY` (or `TYPESAFE_API_KEY`) is set. See [Security](#security) for what is sent to these services.

### Forecasting

- **Multi-horizon forecasts.** A scikit-learn model predicts dissolved oxygen, pH, and water temperature at **+15, +60, and +180 minutes**.
- **Honest output.** Parameters with stale or insufficient input are *withheld*, never guessed. Warnings flag reduced reliability.
- **Point-in-time inference.** The model only sees readings timestamped before the moment being forecast, so replays do not leak future data.
- **Hash-pinned model.** The worker refuses to load a model file whose SHA-256 does not match `ml/MODEL_SHA256`.

### Web dashboard (Next.js)

- **Overview.** Farm health banner, a 3D digital twin of the farm, and a summary of current alerts.
- **Ponds.** Card and table views of all ponds in numeric order, filterable by status.
- **Pond details.** Live parameter badges, historical charts that show gaps as breaks (a gap is about three times the usual reading spacing, and at least 20 minutes), forecast outlook for +15m, +60m, and +180m, the pond's alert history, field notes, downstream risks, and species settings.
- **Alerts.** Active, acknowledged, and resolved alerts in one table, with one-click acknowledgement.
- **Compare ponds.** Side-by-side telemetry overlays of several ponds over a selectable time range.
- **Demo and simulation.** Read-only historical replay (24-hour or 7-day windows, at real time or up to 10,800× speed), a guided alert simulator that walks through warning, escalation, and resolution on the database, and a what-if playground.
- **System status.** API uptime, database and ML worker health.
- **Tests.** An advisor test lab for exercising the alert advisor against sample alerts.

### 3D digital twin

- An interactive Three.js scene of the farm, built with React Three Fiber and Drei. It shows 17 ponds in a grid with berms, service lanes, and animated water.
- Pond rim lights and labels reflect each pond's current status.
- Click any pond to fly the camera to it and open a telemetry drawer with sparklines and a link to the detail page.
- Orbit, pan, zoom, and a one-click reset to top-down view.
- A 2D plan view as a fallback for low-power devices.
- Append `?twin=demo` to the URL to inspect labelled demo states.

### Mobile app (Expo)

- A React Native and Expo Router app for farmers, with five tabs: **Dashboard, Alerts, Ponds, Species, and Profile**.
- Live ponds and alerts come from the same REST API and Socket.IO channel as the web dashboard. Screens read from one shared store, and they refetch on reconnect.
- Pond screens cover details, charts, comparison, forecast, sensors, and edit.
- Profile and alert preferences are local to the session.

### Species configuration

- Each pond can be assigned a species from a catalogue: Rohu, Catla, Mrigal, Vannamei shrimp, Tilapia, Walking catfish, Pangasius, Common carp, Grass carp, a custom species, or a polyculture of several species.
- Ponds are never assigned a species automatically. Until one is chosen, the pond shows **Species not set**.
- Catalogue reference ranges are shown for context only. **No species has validated alert limits yet.** Alerts use the general rules until a domain expert approves species limits and an operator supplies them through `AQUAGUARD_SPECIES_POLICIES`.
- **Polyculture compatibility.** A mixed-species pond is checked against a compatibility matrix before it is saved. Each pair is rated:

  | Rating | Meaning | Saving |
  |---|---|---|
  | `high` | Established combination (for example Rohu, Catla and Mrigal) | Saved without comment |
  | `conditional` | Workable with management (for example Rohu with Tilapia) | Needs `acknowledgeWarnings: true` |
  | `unverified` | Not validated, or not in the matrix (for example Pangasius with carp) | Needs `acknowledgeWarnings: true` |
  | `avoid` | Predation risk (Walking catfish with small fish) | Blocked. Acknowledgement cannot override it |

  Walking catfish with larger fish is allowed as `conditional` once the farmer sets `largerFishConfirmed: true`. The matrix is a starting point for the risk engine, not a stocking plan. The pond takes the worst rating among its pairs.

### Historical data

- **Idempotent CSV import** of Fish Welfare Initiative `ara2_*.csv` monitor files. Dry-run by default, deterministic SHA-1 row hashes, and exact-zero sensor dropouts filtered out.
- **Standardized naming.** Ponds are shown as **Pond 1** to **Pond 17**. Raw sensor IDs stay in `sourceId` for provenance.

### Simulated data

- **Simulator.** A separate Node service (`simulator/`) posts synthetic readings for ponds whose data source is set to simulator.
- **Anomaly mode.** About half the ponds drift into warning and critical ranges, so alert behaviour can be watched end to end. Anomaly data can be removed with `npm run simulator:anom:clear`.

---

## Architecture

### System overview

```
  Sensors / simulator                      Browsers / phones
  POST /api/measurements                   (Next.js dashboard, Expo app)
          │                                          ▲
          ▼                                          │ REST (JSON) + Socket.IO
┌───────────────────────────────────────────────────────────────────┐
│  backend/  Node.js 22 + Express 4  (port 4000)                    │
│                                                                   │
│  validate ─► persist ─► classify ─► alert lifecycle ─► forecast   │
│  (Zod)       (Mongo)    (risk.js)     (alerts.js)     (inference)│
│                                                  │                │
│                                       alert bus ─┴─► Socket.IO    │
│                                            │                      │
│                                       alert advisor ─► Jev / LLM  │
└──────────────┬───────────────────────────────────────┬────────────┘
               │ MongoDB driver v6                      │ JSON lines over stdio
               ▼                                        ▼ (child process, no port)
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  MongoDB Atlas              │        │  ml/worker.py  (Python 3.14)     │
│  database: aquaguard        │        │  scikit-learn, SHA-256 pinned    │
│  9 collections, JSON Schema │        │  model: aquaguard_model.pkl      │
└─────────────────────────────┘        └──────────────────────────────────┘
```

### Components

| Component | Location | Responsibility |
|---|---|---|
| **API server** | `backend/` | The single source of truth. Validates input, persists measurements, applies risk rules, runs the alert lifecycle, calls the ML worker and the optional alert advisor, and broadcasts changes. |
| **Web dashboard** | `frontend/` | Next.js 16 App Router client. It has no database access and no model of its own; every value comes from the API. |
| **Mobile app** | `mobile-app/` | Expo SDK 57 client for farmers. It consumes the same REST API and realtime channel. |
| **Simulator** | `simulator/` | Node service that posts synthetic readings for simulator-sourced ponds, with an optional anomaly mode. |
| **ML worker** | `ml/` | A long-lived Python child process that the API starts. It talks over stdin/stdout and opens no network port. Its environment is restricted, so the database URI is never passed to it. |
| **Database layer** | `database/` | Connection handling, JSON Schema validators, indexes, and maintenance and import scripts. Shared with the backend. |
| **Model bundle** | `aquaguard_model.pkl` | The trained forecasting model, verified against `ml/MODEL_SHA256` before it is loaded. |

### Measurement pipeline

Every reading, whether from hardware, the simulator, or an import, goes through the same steps:

1. **Validate.** Zod checks the shape, units, physical bounds, and duplicate parameters. Invalid values are split out so valid ones still go through.
2. **Resolve the pond.** The pond must exist, and the reading must not be more than 5 minutes in the future.
3. **Persist.** The measurement is stored with `recordedAt` (device time) and `receivedAt` (server time). Duplicate idempotency keys are detected here.
4. **Classify.** Each value is checked against the active rule. A pond's species can override the general rule only when an approved species policy exists.
5. **Settle alerts.** The alert lifecycle opens, escalates, acknowledges, or resolves alerts, using one atomic write per change.
6. **Publish.** Changes are pushed to clients over Socket.IO. New and escalated alerts also go to the advisor, when it is enabled.
7. **Forecast (optional).** If this is the newest reading for its pond, the ML worker runs on the preceding 48 hours of data. Failures here are logged and never block steps 1 to 6.

### Design principles

- **One place for rules.** Thresholds live in `backend/src/services/risk.js`, with optional overrides from a JSON file. The Python worker reads the same key names. Clients never copy the numbers.
- **Unknown is not healthy.** A missing, non-numeric, or disabled rule classifies as `UNKNOWN`, never `NORMAL`.
- **Fail loudly on bad config, quietly on optional parts.** An invalid threshold or species file stops startup. A missing model, Python process, or AI service degrades only that feature; monitoring keeps running.
- **The advisor advises, it does not decide.** Notes, advice, and downstream risks never open, resolve, or change the severity of an alert. Only the rule engine does that.
- **Atlas only.** The API refuses any database URI that does not point to a `*.mongodb.net` host. There is no local-database fallback.
- **Read-only replay.** Historical replay never writes measurements, predictions, or alert state.
- **Dependency injection.** `createApp()` receives its database, ML worker, and clock as parameters, so tests can use isolated databases and fake workers.

---

## Tech stack

| Layer | Technologies |
|---|---|
| API | Node.js ≥ 22, Express 4, Zod 3, MongoDB Node driver 6, Socket.IO 4, cors |
| AI advisor | Jev (TypeSafe) for analysis and checks; any OpenAI-compatible chat endpoint for solution text. Both optional. |
| Web | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Recharts, Three.js with React Three Fiber and Drei, Phosphor icons, Geist font, Zod |
| Mobile | React Native 0.86, Expo SDK 57, Expo Router, React Native Tab View, Socket.IO client, Jest with Testing Library |
| Database | MongoDB Atlas, JSON Schema validators, compound and partial unique indexes |
| ML | Python 3.14, scikit-learn 1.8.0, NumPy 2.4.3, pandas 3.0.1, joblib 1.5.3 |
| Testing | Node test runner (backend, database, simulator), Vitest (web), Jest (mobile) |

---

## Repository layout

```
.
├── backend/                 REST API and realtime server (port 4000)
│   ├── src/
│   │   ├── app.js           createApp(): dependency-injected Express app
│   │   ├── server.js        process entry: DB connect, ML worker, listen
│   │   ├── realtime.js      Socket.IO transport for alert and pond events
│   │   ├── config/          environment configuration
│   │   ├── routes/          HTTP routes (thin handlers)
│   │   ├── services/        risk, alerts, species, ingestion, inference, replay, queries,
│   │   │                    analytics, downstream risks, what-if, demo pond, pond sync
│   │   │   └── ai/          alert advisor, Jev and LLM clients, couplings, policy, farmer notes
│   │   ├── validators/      Zod input schemas
│   │   ├── ml/              client for the Python worker
│   │   ├── middleware/      request logging, error handling
│   │   └── utils/           errors, params, HTTP helpers
│   └── tests/               unit and integration suites
├── frontend/                Next.js web dashboard (port 3000)
│   └── src/
│       ├── app/             routes: Overview, Ponds, Pond details, Alerts, Compare ponds,
│       │                    Demo & simulation, Tests, System status
│       ├── components/
│       │   ├── farm/        3D digital twin (React Three Fiber)
│       │   ├── features/    domain components: pond cards, alerts, replay, forecast, species
│       │   ├── charts/      telemetry charts
│       │   ├── shell/       app layout, refresh
│       │   └── ui/          design-system primitives
│       └── lib/             API client, schemas, fleet and status logic, formatting
├── mobile-app/              Expo farmer app
│   └── src/
│       ├── app/             Expo Router screens: (tabs), pond and alert detail, settings
│       ├── context/         app store and live-data store (REST + Socket.IO)
│       ├── services/        API, alerts, ponds, realtime, config, notes, downstream risks
│       ├── lib/             status, forecast, chart, and formatting logic
│       └── components/      shared UI
├── simulator/               synthetic reading generator (posts to the API)
├── database/                MongoDB tooling, shared by the backend
│   ├── lib/                 connection handling, FWI column mapping
│   ├── schemas/             collection JSON Schema validators
│   ├── indexes/             index definitions
│   ├── scripts/             ping, init, indexes, check, verify, seed, import, rename,
│   │                        simulated water quality, anomaly clearing
│   ├── fixtures/            tagged sample data
│   └── tests/
├── ml/                      forecasting worker and model code
│   ├── worker.py            JSON-lines inference worker
│   ├── aquaguard_*.py       feature preparation, inference, and configuration
│   ├── MODEL_SHA256         pinned hash of the model bundle
│   └── requirements.txt     pinned Python dependencies
├── aquaguard-vision/        separate proof of concept: mobile fish-activity monitor (see its README)
├── docs/
│   ├── DATASET_AND_MODEL.md dataset inventory, mappings, and model evaluation
│   └── UX_PLAN.md           interface plan
├── aquaguard_model.pkl      trained model bundle
├── package.json             npm workspaces: database, backend, frontend, simulator
└── pyproject.toml           Python project metadata (Python ≥ 3.14)
```

---

## Getting started

### Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js and npm | ≥ 22 | backend, database, simulator, and web dashboard |
| Python | 3.14 (see `.python-version`) | forecasting worker |
| MongoDB Atlas cluster | any | the only supported database |
| Expo Go, or a simulator | current | mobile app (optional) |

> [!NOTE]
> Keep the forecasting worker's dependencies in a virtual environment. The API starts it with `PYTHON_BIN` (default `python3`), so that interpreter must have the packages from `ml/requirements.txt`.

### 1. Install

```bash
# From the repository root: installs the database, backend, frontend, and simulator workspaces
npm install

# Python dependencies for the forecasting worker (use a virtualenv)
pip install -r ml/requirements.txt
```

The mobile app is a separate project:

```bash
cd mobile-app
npm install --legacy-peer-deps   # the flag works around an optional peer conflict
```

Run `npm install --legacy-peer-deps` again after every reinstall, not just the first time. An optional `react-dom` peer of `@expo/devtools` conflicts with `react` 19.2.3, and the flag works around it.

### 2. Configure the database

```bash
cp backend/.env.example backend/.env
```

Set `MONGODB_URI` in `backend/.env` to your Atlas connection string:

```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/aquaguard?retryWrites=true&w=majority
```

Then prepare the database. All of these are safe to rerun:

```bash
npm run db:ping -w database       # check the connection
npm run db:init -w database       # create collections and validators
npm run db:indexes -w database    # create indexes
npm run db:check -w database      # verify the structure
```

If you are migrating an existing database, rename raw sensor IDs to pond names:

```bash
npm run db:standardize-names -w database
```

To load the historical campaign (optional), dry-run first, then write. Set `FWI_DATA_DIR` in `backend/.env` to avoid typing the folder each time:

```bash
node database/scripts/import-fwi.js --dir <path-to-csvs>           # dry run
node database/scripts/import-fwi.js --dir <path-to-csvs> --write   # persist
```

### 3. Run

Start the API in one terminal:

```bash
npm start
# Wait for: "AquaGuard API listening on http://127.0.0.1:4000/api, Socket.IO on the same port (database: ATLAS, ml enabled, demo off)"
```

Start the dashboard in a second terminal:

```bash
npm run dev:frontend
```

Then open:

- **Dashboard:** http://localhost:3000
- **API health:** `curl http://127.0.0.1:4000/api/health`. Look for `"database":{"status":"up","target":"atlas"}`.

The dashboard needs the API running first. Without it, every page shows "Could not reach the PondFix API".

Optional, in a third terminal, to feed simulated readings to the ponds set to simulator:

```bash
npm run simulator              # normal readings
npm run simulator:anom         # readings that drift into warning and critical ranges
```

To run the mobile app:

```bash
cd mobile-app
cp .env.example .env.local       # set EXPO_PUBLIC_API_URL to this computer's LAN address
npm start
```

For a phone to reach the API, start the backend with `HOST=0.0.0.0`. The phone and the computer must be on the same network. Never use `localhost` in the phone's address, because it points at the phone itself. After you change `.env.local`, restart Expo with the cache cleared (`npx expo start -c`), because Expo reads `EXPO_PUBLIC_*` values only when it builds the app.

If `npm start` reports that port 4000 is already in use, another API instance is running. Stop it first.

### Command reference

| Command | Runs |
|---|---|
| `npm start` | API server (backend) |
| `npm run dev:backend` | same as `npm start` |
| `npm run dev:frontend` | Next.js dev server on port 3000 |
| `npm run build:frontend` | production build of the dashboard |
| `npm run simulator` | simulator, normal readings |
| `npm run simulator:anom` | simulator with anomaly mode |
| `npm run simulator:anom:clear` | delete anomaly data written by the simulator |
| `npm test` | backend, database, frontend, and simulator tests |
| `npm run db:* -w database` | database maintenance (see the database scripts table) |

---

## Configuration

Configuration comes from environment variables. The backend reads `backend/.env`. The dashboard reads `frontend/.env.local`, which is optional for local development. Real `.env` files are git-ignored, and the `.env.example` templates are tracked.

### Backend

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(required)* | Atlas connection string. Server-side only, never logged. |
| `MONGODB_DB` | `aquaguard` | Database name. |
| `PORT` | `4000` | API port. |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to allow LAN devices. |
| `NODE_ENV` | `development` | `production` hides internal error messages in logs. It does not switch off demo endpoints; use `DEMO_ENABLED` for that. |
| `CORS_ORIGINS` | localhost and 127.0.0.1 on ports 3000, 5173, 8081 | Comma-separated allowed browser origins. |
| `BODY_LIMIT` | `20kb` | Maximum request body size. |
| `MAX_QUERY_RANGE_DAYS` | `366` | Maximum span for telemetry queries. |
| `STALE_AFTER_MINUTES` | `60` | Age after which a reading is `STALE`. |
| `DEMO_ENABLED` | `false` | Enables `/api/demo/*`: demo measurements, scenarios, and the demo pond. These write simulated readings into the database. Use only with a test database. |
| `AQUAGUARD_THRESHOLDS` | *(none)* | Path to a JSON file overriding risk limits (keys `do`, `ph`, `temp`). An invalid file stops startup. |
| `RISK_RULES_DISABLED` | *(none)* | Comma-separated parameters whose rule is switched off: `dissolved_oxygen`, `ph`, `temperature`. A switched-off parameter classifies as `UNKNOWN`. |
| `AQUAGUARD_SPECIES_POLICIES` | *(none)* | Path to a JSON file of expert-approved species limits. Without it, no species has validated limits. |
| `ML_ENABLED` | `true` | Starts the forecasting worker. |
| `PYTHON_BIN` | `python3` | Interpreter that runs `ml/worker.py`. |
| `ML_TIMEOUT_MS` | `30000` | Forecast request timeout. |
| `AQUAGUARD_MODEL_PATH` | `aquaguard_model.pkl` | Path to the model bundle. |
| `JEV_API_KEY` | *(none)* | Enables the alert advisor's Jev analysis. `TYPESAFE_API_KEY` is accepted as an alias. Server-side only. |
| `JEV_API_URL` | `https://api.typesafe.ai/v1/systemone` | Jev endpoint. |
| `JEV_MODEL` | `jev-latest` | Jev model. Pin a tested version, because `jev-latest` can change. |
| `JEV_TIMEOUT_MS` | `8000` | Jev request timeout. |
| `LLM_ENDPOINT_URL` | *(none)* | OpenAI-compatible endpoint for solution text. Used only with Jev enabled. |
| `LLM_API_KEY` | *(none)* | Key for `LLM_ENDPOINT_URL`. Server-side only. |
| `LLM_MODEL` | `default` | Model name sent to `LLM_ENDPOINT_URL`. |
| `LLM_TIMEOUT_MS` | `30000` | LLM request timeout. |
| `FWI_DATA_DIR` | *(none)* | Folder of `ara2_*.csv` files, used by the import scripts when `--dir` is not given. |

Example threshold override (`AQUAGUARD_THRESHOLDS`):

```json
{
  "do": { "low_warn": 4.0, "low_crit": 2.5 },
  "ph": { "low_warn": 6.5, "low_crit": 6.0, "high_warn": 8.5, "high_crit": 9.0 }
}
```

### Frontend

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:4000/api` | API base URL used by the browser. Browser-safe values only. |
| `API_BASE_URL` | same as above | Optional server-side API URL for server components. |
| `NEXT_PUBLIC_DISPLAY_TIMEZONE` | `UTC` | Time zone for displayed timestamps. Data is stored in UTC. |

### Mobile

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend origin as seen from the phone, for example `http://192.168.1.20:4000`. Set in `mobile-app/.env.local`. Restart Expo with `npx expo start -c` after changing it. |

### Simulator

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://127.0.0.1:4000/api` | Backend API the simulator posts to. |
| `SIM_INTERVAL_MINUTES` | `1` | Minutes between simulated readings. Must be greater than 0. |
| `SIM_BACKFILL_HOURS` | `6` | Hours of history written when the simulator starts. |
| `SIM_ANOMALIES` | off | Set to `1` (or use `npm run simulator:anom`) to drift about half the ponds into warning and critical ranges. |

### Database scripts

| Command | Action |
|---|---|
| `npm run db:ping -w database` | Test the connection and credentials. |
| `npm run db:init -w database` | Create collections and register validators. |
| `npm run db:indexes -w database` | Create indexes. |
| `npm run db:check -w database` | Read-only check of collections, validators, and indexes. |
| `npm run db:standardize-names -w database` | Rename raw `ara2_*` IDs to **Pond 1** to **Pond 17**. |
| `npm run db:seed -w database` | Insert tagged sample data (idempotent). |
| `npm run db:unseed -w database` | Remove sample data. Dry run by default; add `-- --confirm` to delete. |
| `npm run db:verify -w database` | End-to-end check of validation and alert lifecycles. |
| `npm run db:simulate-wq -w database` | Generate simulated water-quality data. |
| `npm run db:clear-anomalies -w database` | Remove anomaly data written by the simulator. |

---

## REST API

All endpoints live under `/api`. Successful responses return the resource directly or `{ "items": [...], "count": n }`. Errors return `{ "error": { "code": "...", "message": "..." } }`.

### Health and configuration

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service status, database connectivity and target, demo state, AI advisor state, and ML worker state. `status` is `ok`, `degraded` (ML worker unavailable), or `down` (database unreachable, HTTP `503`). |
| `GET` | `/risk-rules` | Active limits, units, source of each rule, and rule-set version. |
| `GET` | `/species-profiles` | Species catalogue, the status of each safety profile, and the polyculture compatibility matrix. |

Example health response:

```json
{
  "status": "ok",
  "time": "2026-10-14T09:30:00.000Z",
  "uptimeSeconds": 8829,
  "database": { "status": "up", "target": "atlas" },
  "demo": { "enabled": false },
  "ai": { "advisor": true, "llm": false },
  "ml": { "status": "ready" }
}
```

### Ponds

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ponds` | All ponds, sorted naturally (Pond 1, Pond 2, … Pond 17). |
| `GET` | `/ponds/summaries` | Every pond's snapshot in one call, for fleet views. |
| `GET` | `/ponds/:id` | One pond's metadata and species configuration. |
| `PATCH` | `/ponds/:id/species` | Set or clear a pond's species. Only species fields can change. See [Species configuration](#species-configuration) for the request body and the `409` and `422` responses. |
| `PATCH` | `/ponds/:id/data-source` | Set one pond's data source to `sensor` or `simulator`. |
| `PATCH` | `/ponds/data-source` | Set the data source for all ponds at once. |
| `GET` | `/ponds/:id/summary` | Latest values, status, and open alerts. |
| `GET` | `/ponds/:id/measurements` | Cursor-paginated history, newest first. Filters: `from`, `to`, `parameter`, `source`, `limit`, `cursor`. |
| `GET` | `/ponds/:id/measurements/latest` | Latest reading per parameter, with age and staleness. |
| `GET` | `/ponds/:id/predictions` | Latest forecasts with forward risk evaluation. |
| `GET` | `/ponds/:id/analytics` | Statistical aggregates and time-bucket distributions. |
| `GET` | `/ponds/:id/alerts` | Alert history for one pond. |
| `GET` | `/ponds/:id/downstream-risks` | Likely knock-on effects from the pond's latest readings. Information only. |
| `GET` | `/ponds/:id/notes` | Recent farmer field notes for a pond (`limit` up to 20 by default). |
| `POST` | `/ponds/:id/notes` | Add a field note. Jev classifies it when configured. Returns `201`. |

### Measurements

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/measurements` | Ingest a reading. Returns `201` (or `200` for a duplicate idempotency key). |

Example request:

```json
{
  "pondId": "<pond ObjectId>",
  "source": "live",
  "recordedAt": "2026-10-14T09:30:00Z",
  "idempotencyKey": "sensor-7-20261014-0930",
  "values": [
    { "parameter": "dissolved_oxygen", "value": 2.4, "unit": "mg/L" },
    { "parameter": "temperature", "value": 27.8, "unit": "C" }
  ]
}
```

| Field | Rules |
|---|---|
| `pondId` | Required. Must exist. |
| `source` | `live` (default) or `simulated`. |
| `recordedAt` | Optional ISO 8601 time. Cannot be more than 5 minutes ahead of server time. |
| `values` | 1 to 4 items. Parameters must be unique: `dissolved_oxygen`, `ph`, `temperature`, `water_level`. |
| `idempotencyKey` | Optional, up to 100 characters: letters, digits, `.`, `_`, `:`, `-`. |

The response includes the stored measurement, the risk result for each parameter, the alert changes, any `rejectedValues`, and the forecast status.

### Species configuration

`PATCH /ponds/:id/species` accepts one of three modes:

```json
{ "mode": "unconfigured" }
{ "mode": "single", "speciesProfileId": "rohu" }
{ "mode": "single", "speciesProfileId": "other", "customSpeciesName": "Silver barb" }
{
  "mode": "polyculture",
  "species": [{ "speciesProfileId": "rohu" }, { "speciesProfileId": "tilapia" }],
  "acknowledgeWarnings": true,
  "largerFishConfirmed": false
}
```

| Status | Code | When |
|---|---|---|
| `200` | | The species was saved. |
| `409` | `COMPATIBILITY_ACKNOWLEDGEMENT_REQUIRED` | The polyculture is `conditional` or `unverified` and `acknowledgeWarnings` is not `true`. The body lists each risky pair. |
| `422` | `INCOMPATIBLE_SPECIES` | The polyculture contains an `avoid` pair. Acknowledgement does not override it. |
| `422` | `VALIDATION_ERROR` | Invalid fields, for example a polyculture with fewer than two species or proportions that do not total 100%. |

### Alerts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/alerts` | Query alerts. Filters: `status` (`OPEN` by default, which means `ACTIVE` and `ACKNOWLEDGED`; also `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`, `ALL`), `origin` (`observed` or `predicted`), `parameter`, `severity` (`WARNING` or `CRITICAL`), `pondId`. |
| `PATCH` | `/alerts/:id/acknowledge` | Mark an alert as seen. Idempotent. Returns `409` for a resolved alert. |

### Analytics, what-if and replay

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/analytics/compare` | Compare metrics across ponds. |
| `POST` | `/what-if` | Classify hypothetical conditions and list what to watch for. Writes nothing. |
| `GET` | `/replay/ponds` | Ponds that have historical data. |
| `GET` | `/replay/ponds/:id` | 24-hour and 7-day replay presets for one pond. |
| `GET` | `/replay/ponds/:id/window` | Chronological historical telemetry for a window. |
| `POST` | `/replay/forecast` | Forecast at a past point in time. Read-only. |

### Demo (only when `DEMO_ENABLED=true`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/demo/scenarios` | Demo scenarios. |
| `POST` | `/demo/measurement` | Write a simulated reading into the database. |
| `GET` | `/demo/pond` | Status of the guided demo pond. |
| `POST` | `/demo/pond/setup` | Prepare the demo pond. |
| `POST` | `/demo/pond/start` | Start the guided demo. |
| `POST` | `/demo/pond/advance` | Advance the guided demo to its next step. |
| `POST` | `/demo/pond/reset` | Reset the guided demo. |

The demo pond routes take no pond ID and can only touch the demo pond. They also require a dedicated database, whose name contains `demo` or `test`.

---

## Realtime events

The API serves Socket.IO on the same port as HTTP. Events are **not replayed**. After every reconnect, clients refetch from REST.

| Event | Payload | Meaning |
|---|---|---|
| `alert:new` | alert | A new alert opened. |
| `alert:updated` | alert | An alert changed (escalated, acknowledged, or updated). |
| `alert:resolved` | alert | An alert resolved. |
| `pond:reading_updated` | pond update | A pond received a new reading. |
| `pond:updated` | pond update | Pond metadata changed, for example its species or data source. |
| `pond:forecast_updated` | pond update | New forecasts are available. |

Alert payloads match the shape returned by `GET /api/alerts`.

---

## Risk rules and alert lifecycle

### Limits

Rules are defined in `backend/src/services/risk.js`. Comparisons are strict, so a value exactly on the acceptable limit is normal.

| Parameter | Acceptable | WARNING | CRITICAL | Status |
|---|---|---|---|---|
| Dissolved oxygen (mg/L) | ≥ 3.0 | 2.0 to < 3.0 | < 2.0 | Project default |
| pH | 6.5 to 8.5 | < 6.5 or > 8.5 | < 6.0 or > 9.0 | **Provisional demo values** |
| Temperature (°C) | 20 to 32 | < 20 or > 32 | < 15 or > 35 | **Provisional demo values** |

Dissolved oxygen is the only parameter that can raise predictive alerts. Water level is stored but not classified.

### Pond status

| Status | Meaning |
|---|---|
| `CRITICAL` | At least one fresh reading is in the critical band. |
| `WARNING` | At least one fresh reading is in the warning band. |
| `NORMAL` | All fresh readings are within the acceptable range. |
| `STALE` | The latest reading is older than `STALE_AFTER_MINUTES`. |
| `NO_DATA` | No readings exist for the pond. |

An excursion always beats a stale or healthy value elsewhere, so a fresh warning is never hidden by old data.

### Alert lifecycle

```
            reading in WARNING/CRITICAL          reading back in range
  (none) ─────────────────────────────► ACTIVE ─────────────────────────► RESOLVED
                                         │  ▲                              (kept as history)
                 PATCH …/acknowledge     │  │  worse reading
                                         ▼  │  (re-opens as ACTIVE)
                                     ACKNOWLEDGED
```

- **Open.** A reading in `WARNING` or `CRITICAL` opens one alert per pond, parameter, side, and data source. A unique index on `openKey` makes duplicates impossible.
- **Escalate.** A `CRITICAL` reading on an open `WARNING` alert upgrades it in place. An acknowledged alert returns to `ACTIVE` if the condition gets worse.
- **Acknowledge.** An operator marks the alert as seen. The condition stays open.
- **Resolve.** A reading back within range closes the alert. Resolved alerts keep their history and drop `openKey`, so the same condition can open a new alert later.
- **Isolate.** An excursion on the low side does not resolve a high-side alert for the same parameter, and an invalid value never resolves anything.

---

## Forecasting engine

- **Model.** `aquaguard_model.pkl` (bundle version `aquaguard-2026-10-10-2b5b58b4`), trained on cleaned aquaculture telemetry.
- **Horizons.** +15, +60, and +180 minutes for dissolved oxygen, pH, and temperature. Longer horizons chain 3-hour blocks, and each is refused beyond its validated limit.
- **Input.** At least 24 hours of 15-minute readings for the pond. The API passes up to 48 hours of history, strictly before the reading being forecast.
- **Freshness.** A parameter whose latest valid reading is older than 60 minutes is withheld, and the response says why.
- **Reliability warnings.** Forecasts that depend on chaining, or that cover a pond with mostly invalid recent data, carry a warning.
- **Integrity.** The worker loads the model only if its SHA-256 matches `ml/MODEL_SHA256`.
- **Isolation.** The worker runs as a child process with a minimal environment. It opens no ports, and the database URI is never passed to it.
- **Fallback.** If Python or the model is unavailable, ingestion and threshold alerts keep working. The `/health` endpoint reports the ML state as `disabled`, `ready`, or `unavailable`.
- **Species.** The model is trained without species information, so its forecasts are not species-specific.

Model details and validation are in [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md).

---

## Data model

Database: `aquaguard`. All timestamps are UTC BSON dates. Validators are JSON Schema, and the schemas deliberately reject only structural errors and physically impossible values. Out-of-range but plausible readings are stored and flagged, not discarded.

| Collection | Purpose | Key indexes |
|---|---|---|
| `users` | Operator accounts | unique `email` (when present) |
| `ponds` | Pond metadata: name, source ID, species, data source, status | unique `sourceId`, unique `(userId, name)` |
| `measurements` | Time-series readings with source and provenance | `(pondId, recordedAt)`, unique `dedupKey` (when present), `(pondId, source, recordedAt)` |
| `predictions` | ML forecasts, kept apart from measurements | `(pondId, parameter, forecastFor)`, unique forecast identity |
| `alerts` | Alert lifecycle documents | unique partial `openKey`, `(pondId, status, createdAt)`, `(status, createdAt)` |
| `farmerNotes` | Farmer field observations with their derived category and severity | `(pondId, createdAt)` |
| `notificationDeliveries` | Log of alert deliveries | `(alertId, attemptedAt)` |
| `modelRuns` | Audit log of inference runs | `(pondId, startedAt)` |

There are no TTL indexes. Measurements and resolved alerts are kept indefinitely by design.

---

## Testing

```bash
npm test                          # backend, database, frontend, and simulator suites

npm run test:unit -w backend      # unit tests: no database or Python needed
npm run test:integration -w backend   # uses throwaway databases on your Atlas cluster

npm test -w frontend              # Vitest component and utility tests
npm run lint -w frontend
npm run typecheck -w frontend
npm run build:frontend            # production build

cd mobile-app
npm test                          # Jest: unit, component, and navigation tests
npm run typecheck
npm run lint
npm run test:e2e                  # end-to-end tests
```

> [!NOTE]
> Integration tests run against the Atlas cluster in `MONGODB_URI`, but in a separate database (`MONGODB_TEST_DB`, default `aquaguard_test`). That database is dropped at the start and end of each run. The tests refuse to run if the test database name matches `MONGODB_DB`.

---

## Security

- **Credentials.** `MONGODB_URI` is read only on the server. It is never sent to the browser, the mobile app, or the ML worker, and error messages redact it.
- **AI service keys.** `JEV_API_KEY` and `LLM_API_KEY` stay on the server.
- **What the AI advisor sends.** When the advisor is enabled, alert facts, recent readings, other open alerts, and farmer notes are sent to Jev and, for solution text, to `LLM_ENDPOINT_URL`. Those are external services. Check that this is acceptable for your farm's data before you enable them.
- **Model integrity.** Pickled models run arbitrary code when loaded, so the worker checks the SHA-256 of the bundle before loading it.
- **Input limits.** Request bodies are capped at 20 kB, and query ranges are capped at `MAX_QUERY_RANGE_DAYS`. Page sizes have a maximum.
- **Demo isolation.** Demo endpoints write simulated data into the database. They are disabled by default (`DEMO_ENABLED=false`), so enable them only on a test database.
- **Browser origins.** `CORS_ORIGINS` restricts which browser origins can call the API.
- **No authentication.** The API has no login, roles, or rate limiting. It is designed for a trusted local network. Add authentication and rate limiting before exposing it to the internet.

---

## Known limitations

- **No authentication or roles.** See [Security](#security).
- **Provisional pH and temperature limits.** The values are software-testing defaults. Validate them for your species and site before relying on them.
- **No species has validated alert limits.** Catalogue ranges are reference context only until an expert approves limits.
- **Compatibility is a starting point.** The polyculture matrix is not a stocking plan, and any pair not in it is treated as `unverified`.
- **AI advice is advisory and depends on external services.** It can be unavailable or wrong, and it never changes an alert.
- **Predictive alerts cover dissolved oxygen only.** pH and temperature forecasts are shown but never raise alerts.
- **Historical data is static.** The imported monitoring campaign ended in January 2026, so imported ponds show `STALE` in live mode. Use **Demo and simulation** to see live behaviour.
- **Forecasts are not species-specific,** and longer horizons chain 3-hour blocks, which accumulates error.
- **No push or SMS alert delivery.** The `notificationDeliveries` collection exists, but nothing in the backend writes to it yet.
- **No hardware firmware in this repository.** Sensors are expected to post to `POST /api/measurements`.

---

## Further documentation

| Document | Covers |
|---|---|
| [`backend/README.md`](backend/README.md) | API contracts, the alert state machine, and the ML worker protocol |
| [`frontend/README.md`](frontend/README.md) | Dashboard setup, the digital twin, component rules, and UI testing |
| [`mobile-app/README.md`](mobile-app/README.md) | Expo setup, running on a device, and troubleshooting |
| [`database/README.md`](database/README.md) | Collection schemas, index rationale, and maintenance scripts |
| [`aquaguard-vision/README.md`](aquaguard-vision/README.md) | Separate proof of concept: mobile fish-activity monitoring |
| [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md) | Dataset inventory, column mapping, and model evaluation |
| [`docs/UX_PLAN.md`](docs/UX_PLAN.md) | Interface plan |

---

## Data attribution

The continuous-monitoring aquaculture dataset is provided by the [Fish Welfare Initiative (FWI)](https://www.fishwelfareinitiative.org/) for research and early-warning safety engineering.
