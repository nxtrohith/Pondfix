# AquaGuard

AquaGuard is an early-warning system for aquaculture ponds. It stores water-quality measurements, classifies dissolved-oxygen (DO) risk, keeps a persistent alert history, and runs a forecasting model that predicts DO, pH and water temperature ahead of time.

The backend is the single source of truth. The web dashboard (`frontend/`) and the future mobile app consume its REST API.

> **Status**
> - **Done and verified:** MongoDB Atlas schema and indexes, historical data import, REST API, risk and alert engine, Python forecasting worker, web dashboard (`frontend/`).
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
- [Risk rules and alert lifecycle](#risk-rules-and-alert-lifecycle)
- [Forecasting model](#forecasting-model)
- [Testing](#testing)
- [Security](#security)
- [Limitations](#limitations)
- [Further documentation](#further-documentation)

---

## What it does

- **Ingests measurements** of dissolved oxygen (mg/L), pH, temperature (°C) and water level (m). Each reading is validated, stored, classified and checked against alert rules in one pipeline. Simulated readings use the same pipeline as real ones.
- **Classifies dissolved-oxygen risk:**

  | Value | Status |
  |---|---|
  | below 2.0 mg/L | `CRITICAL` |
  | 2.0 up to, not including, 3.0 mg/L | `WARNING` |
  | 3.0 mg/L or above | `NORMAL` (no warning) |

  Stale or missing data is reported as `STALE` or `NO_DATA`, never as healthy.
- **Maintains persistent alerts**: one open alert per condition, escalation, acknowledgement, automatic recovery, and full history.
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
│   ├── src/
│   │   ├── config/          environment configuration
│   │   ├── routes/          HTTP routes
│   │   ├── services/        risk, alerts, ingestion, inference, queries, analytics, demo
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

# 5. Start the API
npm start                                # http://127.0.0.1:4000/api
```

Check that it is running:

```bash
curl http://127.0.0.1:4000/api/health
```

## Web dashboard

Start the API first, then the dashboard, in two terminals:

```bash
# Terminal 1: API (pick one)
npm start                  # real data on Atlas (needs .env), http://127.0.0.1:4000/api
npm run dev:local          # throwaway local database with the historical data; safe for Simulation

curl http://127.0.0.1:4000/api/health      # expect "status":"ok", database "up"

# Terminal 2: dashboard
npm run dev:frontend       # http://localhost:3000
```

Stop each with `Ctrl+C`. If the dashboard shows "Could not reach the AquaGuard API", the API is not running. `npm run dev:local` writes only to an in-memory database, so you can use the Simulation page without adding demo records to Atlas. Pages: Overview, Ponds, pond details, Forecasts, Alerts, Analytics, Simulation, System Health. Setup details, troubleshooting, API usage and design notes: [`frontend/README.md`](frontend/README.md).

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
npm start                    # starts the server and, if ML_ENABLED, the Python worker
```

The server connects to Atlas on startup and exits if it cannot. The Python worker starts lazily on the first forecast request. If it fails, measurements and threshold alerts keep working, and `/api/health` reports the ML status as `unavailable`.

To check the worker by itself:

```bash
echo '{"id":"1","op":"ping"}' | python3 ml/worker.py
```

## API overview

All routes are under `/api`. Full request and response examples are in [`backend/README.md`](backend/README.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service, database and ML status |
| `GET` | `/risk-rules` | Thresholds and stale window the backend applies |
| `GET` | `/ponds` | List ponds |
| `GET` | `/ponds/:id` | One pond |
| `GET` | `/ponds/:id/summary` | Risk status, latest values and open alerts |
| `GET` | `/ponds/:id/measurements` | Measurements, newest first, paginated |
| `GET` | `/ponds/:id/measurements/latest` | Latest value per parameter, with age and staleness |
| `POST` | `/measurements` | Submit a reading (returns risk, alert changes and inference status) |
| `GET` | `/ponds/:id/predictions` | Latest forecast batch |
| `GET` | `/ponds/:id/alerts` | Alerts for one pond |
| `GET` | `/alerts` | Open alerts across ponds |
| `PATCH` | `/alerts/:id/acknowledge` | Acknowledge an alert (the condition stays open) |
| `GET` | `/ponds/:id/analytics` | Summary and time buckets of observed values |
| `GET` | `/analytics/compare` | Compare ponds over one time range |
| `GET` | `/demo/scenarios` | Demo scenarios (only when demo routes are enabled) |
| `POST` | `/demo/measurement` | Submit a simulated demo reading |

Example:

```bash
curl -X POST http://127.0.0.1:4000/api/measurements \
  -H 'content-type: application/json' \
  -d '{"pondId":"<pond-id>","source":"live","values":[{"parameter":"dissolved_oxygen","value":1.8,"unit":"mg/L"}]}'
```

Errors use one shape: `{"error":{"code":"…","message":"…"}}`. Validation errors also include `details`.

## Risk rules and alert lifecycle

**Dissolved oxygen** rules are applied in `backend/src/services/risk.js`. They match `ml/aquaguard_config.py`, and a test keeps the two in sync.

These are the project's default thresholds. **They are not validated safety limits** for any species, size or farm. Confirm them with your target species and conditions before using them for decisions.

pH, temperature and water level have no validated rules, so they are stored but classified `UNKNOWN` and never raise alerts.

**Alert lifecycle:**

- **Open** when a reading is `WARNING` or `CRITICAL`. Repeated readings update the same alert rather than creating new ones.
- **Escalate** from `WARNING` to `CRITICAL`. An acknowledged alert that escalates returns to `ACTIVE`.
- **Acknowledge** changes `ACTIVE` to `ACKNOWLEDGED`. The condition remains open.
- **Resolve** automatically when a newer reading returns to `NORMAL`. The alert is kept as history.
- **Predicted alerts** come from forecasts, carry `origin: "predicted"`, and are kept separate from observed alerts.
- Only the newest reading per pond and source changes alert state. Older readings are stored without affecting alerts.

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
- **Integration tests** run the API against an ephemeral local `mongod`, with the same validators and indexes as Atlas. They never touch Atlas. The first run downloads a MongoDB binary.
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
- No mobile app, hardware code or notifications exist yet.
- Imported ponds show `STALE` today because the data ends in January 2026.
- Pond metadata (location, area, species) is not recorded because the source data does not include it.
- Thresholds are project defaults, not validated species limits.

## Further documentation

- [`frontend/README.md`](frontend/README.md): dashboard pages, API usage, data-integrity and design rules
- [`backend/README.md`](backend/README.md): API reference, pipeline, alert lifecycle, worker protocol
- [`database/README.md`](database/README.md): schema, indexes, relationships, retention, scripts
- [`docs/DATASET_AND_MODEL.md`](docs/DATASET_AND_MODEL.md): dataset inventory, import mapping, model requirements

## Data attribution

The campaign data is from the [Fish Welfare Initiative](https://www.fishwelfareinitiative.org/) and is shared for research. Cite Fish Welfare Initiative when you use it.
