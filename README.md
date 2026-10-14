# AquaGuard

AquaGuard is an early-warning system for aquaculture ponds. It stores water-quality measurements, classifies dissolved-oxygen (DO) risk, keeps a persistent alert history, and runs a forecasting model that predicts DO, pH and water temperature ahead of time.

The backend is the single source of truth. The web dashboard (`frontend/`) and the future mobile app consume its REST API.

> **Status**
> - **Done and verified:** MongoDB Atlas schema and indexes, historical data import, REST API, risk and alert engine, Python forecasting worker, web dashboard (`frontend/`), historical pond replay (Simulation page).
> - **Not started:** React Native app, hardware firmware, notifications, authentication.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Web dashboard](#web-dashboard)
- [Configuration](#configuration)
- [Database](#database)
- [Historical data import](#historical-data-import)
- [Running the API](#running-the-api)
- [API overview](#api-overview)
- [Historical replay](#historical-replay)
- [Risk rules and alert lifecycle](#risk-rules-and-alert-lifecycle)
- [Forecasting model](#forecasting-model)
- [Testing](#testing)
- [Security](#security)
- [Limitations](#limitations)
- [Further documentation](#further-documentation)

---

## What it does

- **Ingests measurements** of dissolved oxygen (mg/L), pH, temperature (°C) and water level (m). Each reading is validated, stored, classified and checked against alert rules in one pipeline. Simulated readings use the same pipeline as real ones.
- **Classifies dissolved-oxygen, pH and temperature risk.** Dissolved oxygen:

  | Value | Status |
  |---|---|
  | below 2.0 mg/L | `CRITICAL` |
  | 2.0 up to, not including, 3.0 mg/L | `WARNING` |
  | 3.0 mg/L or above | `NORMAL` (no warning) |

  pH and temperature have their own warning and critical limits (provisional demo values; see [Risk rules](#risk-rules-and-alert-lifecycle)). Stale or missing data is reported as `STALE` or `NO_DATA`, never as healthy.
- **Maintains persistent alerts**: one open alert per condition, escalation, acknowledgement, automatic recovery, and full history.
- **Replays historical ponds** on the Simulation page: a continuous 24-hour or 7-day window is played back in original time order, with real model forecasts and the backend's risk rules. Replay is read-only and never creates records or alerts. See [Historical replay](#historical-replay).
- **Forecasts** DO, pH and temperature at 15, 60 and 180 minutes with a trained model. Forecasts are stored separately from measurements and can raise predicted-risk alerts.
- **Imports historical data** from the Fish Welfare Initiative campaign (17 ponds, about 72,700 observations) idempotently, with provenance kept on every record.

## Architecture

```
            +-----------------------------+
 hardware / |  Node.js + Express API      |   future website,
 demo  ---> |  backend/                   | <-- React Native app
            |  validate -> persist ->     |
            |  classify -> alerts ->      |
            |  (optional) inference       |
            +--------+-------------+------+
                     |             |  JSON lines over stdio
                     v             v  (no network port)
            +----------------+  +--------------------------+
            | MongoDB Atlas  |  | Python worker (ml/)      |
            | db: aquaguard  |  | hash-pinned model bundle |
            +----------------+  +--------------------------+
```

- **Backend:** Node.js 22+, Express 4, zod for validation, official MongoDB driver.
- **Database:** MongoDB Atlas, database `aquaguard`. Seven collections with JSON Schema validators and documented indexes.
- **ML:** the project's own scikit-learn bundle, run by a Python worker that the backend starts as a child process.

## Repository layout

```
.
├── backend/                 REST API (see backend/README.md)
│   ├── scripts/             dev-local.js: throwaway local stack for demos
│   ├── src/
│   │   ├── config/          environment configuration
│   │   ├── routes/          HTTP routes
│   │   ├── services/        risk, alerts, ingestion, inference, queries, analytics, demo, replay
│   │   ├── validators/      request schemas
│   │   ├── ml/              client for the Python worker
│   │   ├── middleware/      request logging, error responses
│   │   ├── utils/           errors, params, ids and cursors
│   │   ├── app.js           Express app factory (dependencies injected)
│   │   └── server.js        process entry point
│   └── tests/               unit and integration tests
├── frontend/                Next.js web dashboard (see frontend/README.md)
├── database/                MongoDB setup, fixtures and import (see database/README.md)
│   ├── lib/                 connection, setup, FWI import mapping
│   ├── schemas/             collection validators
│   ├── indexes/             index definitions
│   ├── scripts/             setup, check, seed, verify, import
│   ├── fixtures/            clearly labelled sample data
│   └── tests/               database and import tests
├── ml/                      Python inference worker and model code
│   ├── worker.py            JSON-lines inference process
│   ├── aquaguard_*.py       forecasting code (copied from the training project)
│   ├── MODEL_SHA256         pinned hash of the model file
│   └── requirements.txt     Python dependencies
├── docs/
│   └── DATASET_AND_MODEL.md dataset inventory, import mapping, model requirements
├── aquaguard_model.pkl      trained model bundle (see Security before loading)
└── .env.example             every configuration variable, with defaults
```

## Quick start

**Requirements:** Node.js 22 or later, Python 3.13 (3.11+ should work, not tested), and a MongoDB Atlas cluster.

```bash
# 1. Dependencies
npm install                              # installs the database and backend workspaces
pip install -r ml/requirements.txt       # scikit-learn 1.8.0, numpy 2.4.3, pandas 3.0.1, joblib 1.5.3

# 2. Configuration
cp .env.example .env                     # then set MONGODB_URI (see Configuration)

# 3. Database (idempotent; safe to rerun)
npm run db:ping -w database              # check the connection
npm run db:init -w database              # create collections and validators
npm run db:indexes -w database           # create indexes
npm run db:check -w database             # confirm everything is in place

# 4. Historical data (optional; dry run by default)
node database/scripts/import-fwi.js --dir <path-to>/csv
node database/scripts/import-fwi.js --dir <path-to>/csv --write
node database/scripts/verify-import.js --dir <path-to>/csv

# 5. Start the API (choose one; both use port 4000)
npm start                                # real database from .env (Atlas)
npm run dev:local                        # throwaway local database with historical data (demos)
```

Check that it is running:

```bash
curl http://127.0.0.1:4000/api/health    # "database":{"status":"up","target":"local"} or "remote"
```

## Web dashboard

Start the API first, then the dashboard, in two terminals:

```bash
# Terminal 1: API (choose one)
npm run dev:local          # throwaway local database with the historical data; safe for Simulation
npm start                  # real data on Atlas (needs .env)

# Terminal 2: dashboard
npm run dev:frontend       # http://localhost:3000
```

Confirm the API with `curl http://127.0.0.1:4000/api/health` (expect `"status":"ok"`). Stop each process with `Ctrl+C`.

- If the dashboard shows "Could not reach the AquaGuard API", the API is not running.
- Run only one of `npm start` and `npm run dev:local`. Both use port 4000. `/api/health` reports `"target":"local"` or `"remote"`, so you can tell which one is serving.
- `npm run dev:local` writes only to an in-memory database, so the Simulation page never adds demo records to Atlas. Its data is discarded when you stop it.

Pages: Overview, Ponds, pond details, Forecasts, Alerts, Analytics, Simulation, System Health. The Simulation page has two modes:

- **Historical replay** (default): pick a pond and a 24-hour or 7-day preset (or a custom UTC range), then play the recorded data back at a chosen speed. Replay is read-only and works on either database.
- **Test reading**: save one clearly marked simulated reading, or run the guided alert demo. Both write data and need the local database.

Setup details, troubleshooting, API usage and design notes: [`frontend/README.md`](frontend/README.md).

## Configuration

All settings come from environment variables. Copy `.env.example` to `.env`, which Git ignores. Never commit `.env` or paste its contents into chats, tickets or logs.

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(required)* | Atlas connection string. Server-side only. |
| `MONGODB_DB` | `aquaguard` | Database name |
| `PORT` | `4000` | API port |
| `HOST` | `127.0.0.1` | API bind address |
| `NODE_ENV` | `development` | `production` turns off demo routes by default |
| `CORS_ORIGINS` | `localhost` and `127.0.0.1` on 3000, 5173, 8081 | Comma-separated allowed browser origins |
| `DEMO_ENABLED` | `true` (off in production) | Enables `/api/demo/*` |
| `STALE_AFTER_MINUTES` | `60` | Age after which a reading is reported `STALE` |
| `MAX_QUERY_RANGE_DAYS` | `366` | Largest allowed query window |
| `BODY_LIMIT` | `20kb` | Maximum request body size |
| `ML_ENABLED` | `true` | Enables the forecasting worker |
| `PYTHON_BIN` | `python3` | Python executable for the worker |
| `ML_TIMEOUT_MS` | `30000` | Per-forecast timeout |
| `AQUAGUARD_MODEL_PATH` | `aquaguard_model.pkl` | Optional model path override |
| `AQUAGUARD_THRESHOLDS` | *(none)* | Optional JSON file overriding the DO, pH and temperature limits (see [Risk rules](#risk-rules-and-alert-lifecycle)) |
| `RISK_RULES_DISABLED` | *(none)* | Comma list of parameters (`ph`, `temperature`, `dissolved_oxygen`) whose alert rule is switched off |
| `FWI_DATA_DIR` | *(none)* | Folder with the import CSVs, if not passed as `--dir` |

**Atlas connection string:** special characters in the password must be URL-encoded. For example, `@` becomes `%40` and `$` becomes `%24`. Atlas also needs your current IP in *Network Access*.

## Database

Database: `aquaguard`. All timestamps are stored as UTC BSON dates.

| Collection | Holds |
|---|---|
| `users` | the single demo farmer |
| `ponds` | pond metadata, including `sourceId` for imported ponds |
| `measurements` | one observation of one pond, with `source` (`historical`, `simulated` or `live`) and provenance for imported rows |
| `predictions` | model forecasts, kept separate from measurements |
| `alerts` | persistent alerts with lifecycle state and an `openKey` that prevents duplicate open alerts |
| `notificationDeliveries` | delivery attempts (no provider secrets are stored) |
| `modelRuns` | audit trail for each inference run |

The full schema, validation rules, index purposes and retention policy are in [`database/README.md`](database/README.md).

Maintenance scripts (`npm run <name> -w database`):

| Script | Effect |
|---|---|
| `db:ping` | verify the connection |
| `db:init` | create collections or update their validators (no data changes) |
| `db:indexes` | create missing indexes |
| `db:check` | read-only check of collections, validators and indexes |
| `db:seed` | insert clearly tagged sample data (rerun-safe) |
| `db:unseed` | delete only tagged sample data. Dry run unless `-- --confirm` is passed |
| `db:verify` | end-to-end checks: references, validation rejections, alert lifecycle |

## Historical data import

`database/scripts/import-fwi.js` loads the Fish Welfare Initiative pond CSVs (`ara2_*.csv`).

- **Dry run is the default.** It reads the files and reports what would happen without writing to the database.
- `--write` persists the data. It creates ponds if they are missing and never deletes or overwrites existing records.
- Records are identified by a deterministic key, so rerunning the import skips identical rows. A row whose values differ from the stored record is reported as a conflict and left alone (exit code 2).
- Exact-zero readings are treated as equipment artifacts. Only the affected parameter is dropped, and a row with no usable values is rejected with a reason.
- Source QC flags and the original timestamp text are kept in `provenance`.
- A JSON report is written to `database/reports/` (ignored by Git).

Full column mapping and data notes: [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md).

## Running the API

```bash
npm start                    # Atlas, from .env
npm run dev:local            # ephemeral local MongoDB, historical data imported, for demos and the Simulation page
```

`npm start` connects to the database in `.env` and exits if it cannot connect. `npm run dev:local` starts an in-memory MongoDB, imports the historical CSVs if the folder `~/Preprocess/csv` exists (or `--dir <path>` is given), and prints `LOCAL DEV DATABASE (ephemeral, not Atlas)` before serving. Data is discarded when it stops.

The Python worker starts lazily on the first forecast request. If it fails, measurements and threshold alerts keep working, and `/api/health` reports the ML status as `unavailable`.

To check the worker by itself:

```bash
echo '{"id":"1","op":"ping"}' | python3 ml/worker.py
```

## API overview

All routes are under `/api`. Full request and response examples are in [`backend/README.md`](backend/README.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service, database and ML status |
| `GET` | `/risk-rules` | Every active rule (DO, pH, temperature) with units, limits, enabled flag, source and rule-set version |
| `GET` | `/ponds` | List ponds |
| `GET` | `/ponds/:id` | One pond |
| `GET` | `/ponds/:id/summary` | Risk status, latest values and open alerts |
| `GET` | `/ponds/:id/measurements` | Measurements, newest first, paginated |
| `GET` | `/ponds/:id/measurements/latest` | Latest value per parameter, with age and staleness |
| `POST` | `/measurements` | Submit a reading (returns risk, alert changes and inference status) |
| `GET` | `/ponds/:id/predictions` | Latest forecast batch |
| `GET` | `/ponds/:id/alerts` | Alerts for one pond |
| `GET` | `/alerts` | Alerts across ponds; filter by `status`, `origin`, `parameter`, `severity`, `pondId` |
| `PATCH` | `/alerts/:id/acknowledge` | Acknowledge an alert (the condition stays open) |
| `GET` | `/ponds/:id/analytics` | Summary and time buckets of observed values |
| `GET` | `/analytics/compare` | Compare ponds over one time range |
| `GET` | `/replay/ponds` | Ponds with historical data, with record counts and time span |
| `GET` | `/replay/ponds/:id` | Coverage and the valid 24 h / 7 d replay presets for one pond |
| `GET` | `/replay/ponds/:id/window?from&to` | Chronological historical records for a window, with risk and gaps (read-only) |
| `POST` | `/replay/forecast` | Model forecast as of one historical record, using only earlier data (not stored) |
| `GET` | `/demo/scenarios` | Demo scenarios (only when demo routes are enabled) |
| `POST` | `/demo/measurement` | Submit a simulated demo reading |

Example:

```bash
curl -X POST http://127.0.0.1:4000/api/measurements \
  -H 'content-type: application/json' \
  -d '{"pondId":"<pond-id>","source":"live","values":[{"parameter":"dissolved_oxygen","value":1.8,"unit":"mg/L"}]}'
```

Errors use one shape: `{"error":{"code":"…","message":"…"}}`. Validation errors also include `details`.

## Historical replay

The Simulation page replays imported history so a pond's behaviour can be shown as it happened.

- **Source data:** only `historical` records (the imported FWI campaign data). Values, units and original timestamps are returned as stored. Nothing is interpolated or filled. Gaps longer than 20 minutes are shown as breaks in the chart.
- **Windows:** a preset is offered only when at least 80% of the expected 15-minute readings exist in a continuous window. Presets start only where at least 24 hours of earlier data exist, so the model has enough history.
- **Risk:** each replayed record is classified by the same backend rules as live readings. pH and temperature have no rules and are never alerted.
- **Forecasts:** the Python model runs as of a real record, using only records at or before that moment. Forecasts are requested at record boundaries, about once per replayed hour, and are shown as model output, never as measurements.
- **Isolation:** replay writes nothing. It creates no measurements, predictions, model runs or alerts, so it cannot open, change or resolve any alert. Repeating the same window gives the same results.

Replay works on both the local and Atlas databases, but it is intended for demonstrations. Its forecast alerts exist only in the browser's timeline, not in the Alerts page.

## Risk rules and alert lifecycle

Dissolved oxygen (DO), pH and water temperature are each checked against their own rule, independently. The rules live in `backend/src/services/risk.js`, are validated when the server starts, and are served to the dashboard by `GET /api/risk-rules`; the frontend keeps no thresholds of its own.

| Parameter | Acceptable range | WARNING | CRITICAL | Status of the limits |
|---|---|---|---|---|
| Dissolved oxygen | 3.0 mg/L or above | below 3.0 | below 2.0 | project default (unchanged); matches `ml/aquaguard_config.py`, a test keeps them in sync |
| pH | 6.5 to 8.5 | below 6.5 or above 8.5 | below 6.0 or above 9.0 | **provisional demo values** |
| Temperature | 20 to 32 °C | below 20 or above 32 | below 15 or above 35 | **provisional demo values** |

**Boundaries are strict.** A value inside or exactly on the acceptable range is normal. WARNING is strictly beyond a warning limit, and CRITICAL strictly beyond a critical limit, so exactly 3.0 mg/L is normal, exactly 2.0 mg/L is a warning, pH 8.5 is normal and pH 9.0 is a warning.

**None of these are validated safety limits** for any species, size or farm. The pH and temperature values are placeholders for software testing. Validate them for your target species before using them for decisions.

**Changing the rules.** Point `AQUAGUARD_THRESHOLDS` at a JSON file (the same file the Python worker reads), for example:

```json
{ "ph": { "low_warn": 6.8, "low_crit": 6.3, "high_warn": 8.2, "high_crit": 8.8 } }
```

Keys are `do`, `ph` and `temp`; each side needs both its warning and critical limit. A file replaces the whole rule for that parameter and marks it `configured`. Set `RISK_RULES_DISABLED=ph,temperature` to switch a rule off explicitly (that parameter is then `UNKNOWN`). **Invalid configuration stops the server at startup** (inverted or overlapping limits, non-finite numbers, unknown parameters or units, empty ranges); it never silently disables alerts. Water level has no rule and is stored only.

**Alert identity.** One open alert exists per pond, parameter, side (low or high, for pH and temperature) and data source (`live`, `simulated`, `historical`). A pond can therefore hold a DO warning, a pH critical and a temperature warning at once, and recovering one never touches the others. Observed and forecast (`predicted`) alerts are separate identities.

**Alert lifecycle:**

- **Open** when a reading is `WARNING` or `CRITICAL`. Repeated readings update the same alert rather than creating new ones.
- **Escalate** from `WARNING` to `CRITICAL`. An acknowledged alert that escalates returns to `ACTIVE`.
- **Acknowledge** changes `ACTIVE` to `ACKNOWLEDGED`. The condition remains open.
- **Resolve** automatically when a newer reading of the same parameter returns to `NORMAL`, or moves to the opposite side (a high-pH reading resolves an open low-pH alert). The alert is kept as history.
- **A parameter absent from a reading changes nothing.** Missing, null, non-numeric or non-finite values are `UNKNOWN`: they never open or resolve an alert.
- **One bad channel does not block the others.** If a reading has several values and some are invalid (for example pH 99), the valid ones are evaluated and the rest are reported in `rejectedValues`. If none are valid the request is rejected (422). The demo endpoint stays strict.
- **Predicted alerts** come from forecasts, carry `origin: "predicted"`, and are kept separate from observed alerts. The model forecasts DO, pH and temperature, but only DO forecasts drive alerts.
- Only the newest reading of a given parameter (per pond and source) changes that parameter's alert state. Older readings are stored without affecting alerts.
- Messages are generated from the actual value and active rule, for example `pH observed at 8.80; configured upper warning limit 8.50.`
- **Pond status** (Overview, Ponds) is the worst fresh status across DO, pH and temperature. Stale DO is never hidden by a fresh pH, and a pond with no recent data is `STALE` or `NO_DATA`, not healthy.

## Forecasting model

The bundle `aquaguard-2026-10-10-2b5b58b4` was trained by the project's own pipeline on the cleaned campaign data.

- **Predicts** DO (mg/L), pH and temperature (°C) at 15, 60 and 180 minutes.
- **Needs** at least 24 hours of 15-minute history for the pond. With less, the API reports `insufficient_history`.
- **Does not predict** ammonia, turbidity, salinity, nitrite or water level.
- **Output** includes the forecast value, the persistence baseline and empirical error bands. These are historical error estimates, not calibrated confidence values.
- **Validation** was done on a held-out period (January 16–30, 2026). Known limits: one winter season, 17 ponds in one region, few low-oxygen events. 15-minute temperature forecasts are slightly worse than simply repeating the last value.

Details: [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md).

## Testing

```bash
npm test                     # backend + database + frontend
npm run test:unit -w backend         # no database or Python needed
npm run test:integration -w backend  # starts an ephemeral local MongoDB
```

- **Unit tests** cover risk boundaries, validation rules and helper functions.
- **Integration tests** run the API against an ephemeral local `mongod`, with the same validators and indexes as Atlas. They never touch Atlas. The first run downloads a MongoDB binary. `replay.test.js` covers window ordering, gaps, duplicates, validation, forecast cut-off and read-only behaviour.
- **The real-model test** runs the Python worker on stored historical data. It is skipped unless the CSVs and Python dependencies are present.
- **Frontend tests** (Vitest) cover the API client, formatting, chart gap handling, aggregation and simulation validation. `npm run lint|typecheck|build -w frontend` check the rest.
- **Database tests** cover the import mapping, the import's idempotency and conflict handling, and the setup scripts.

## Security

- `MONGODB_URI` is read only on the server. It is not passed to the Python worker, and error messages are sanitized to remove it.
- Logs record the method, path and status only. They do not include query strings, request bodies or headers.
- The model file is a pickle, and loading a pickle can run code. The worker loads it only if its SHA-256 matches `ml/MODEL_SHA256`.
- CORS is limited to the origins in `CORS_ORIGINS`. Request bodies are capped at 20 kB, and query ranges and page sizes are capped.
- **There is no authentication.** The API is designed for a trusted local network with one farmer. Add authentication and rate limiting before exposing it, and set `NODE_ENV=production` to turn off demo routes.

## Limitations

- Atlas setup and the historical import have been run and verified against the real cluster. The full automated test suite has been run on a local database only.
- Historical replay has been verified against the local copy of the data, not in a browser automation tool.
- `npm run dev:local` discards its data when stopped; re-run it to re-import.
- No mobile app, hardware code or notifications exist yet.
- Imported ponds show `STALE` today because the data ends in January 2026.
- Pond metadata (location, area, species) is not recorded because the source data does not include it.
- Thresholds are project defaults, not validated species limits. The pH (6.5 to 8.5) and temperature (20 to 32 °C) limits are provisional demo values.
- pH and temperature alerts are observed-reading alerts only; forecast alerts exist for dissolved oxygen only.
- The Python worker's own default config (`ml/aquaguard_config.py`) still defines no pH or temperature limits; the backend is the source of truth for alerts.

## Further documentation

- [`frontend/README.md`](frontend/README.md): dashboard pages, API usage, data-integrity and design rules
- [`backend/README.md`](backend/README.md): API reference, pipeline, alert lifecycle, worker protocol
- [`database/README.md`](database/README.md): schema, indexes, relationships, retention, scripts
- [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md): dataset inventory, import mapping, model requirements

## Data attribution

The campaign data is from the [Fish Welfare Initiative](https://www.fishwelfareinitiative.org/) and is shared for research. Cite Fish Welfare Initiative when you use it.
