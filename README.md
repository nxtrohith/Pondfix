# AquaGuard

AquaGuard is an end-to-end early-warning and monitoring system for commercial aquaculture ponds. It continuously ingests water-quality telemetry, evaluates dissolved-oxygen (DO), pH, and water temperature risk, maintains a persistent alert lifecycle, and runs a machine-learning forecasting engine to predict conditions up to 3 hours ahead.

The system features an interactive **3D Digital Twin** of the pond farm, real-time fleet surveillance, read-only historical playback of 72,700+ observations, and standardized pond management across **Pond 1** through **Pond 17**.

> [!NOTE]
> **Implementation Status**
> - **Completed & Verified:** MongoDB Atlas schema and indexes, historical data import pipeline, Express REST API, strict risk evaluation & alert engine, hash-verified Python scikit-learn forecasting worker, Next.js 16 / React 19 dashboard with Three.js 3D Digital Twin, historical pond replay, and standardized pond fleet naming.
> - **Planned:** React Native mobile application, custom hardware sensor firmware, automated push/SMS notifications, and role-based authentication.

---

## Table of Contents

- [Key Capabilities](#key-capabilities)
- [System Architecture](#system-architecture)
- [Repository Layout](#repository-layout)
- [Quick Start](#quick-start)
  - [Option A: Instant Local Demo (Zero Setup)](#option-a-instant-local-demo-zero-setup)
  - [Option B: Production / MongoDB Atlas Setup](#option-b-production--mongodb-atlas-setup)
  - [Directory & Terminal Guidance](#directory--terminal-guidance)
- [3D Digital Twin (Farm View)](#3d-digital-twin-farm-view)
- [Standardized Pond Naming (Pond 1 – Pond 17)](#standardized-pond-naming-pond-1--pond-17)
- [Web Dashboard Pages](#web-dashboard-pages)
- [Configuration](#configuration)
- [Database & Management Scripts](#database--management-scripts)
- [Historical Data Import](#historical-data-import)
- [REST API Reference](#rest-api-reference)
- [Historical Replay & Simulation](#historical-replay--simulation)
- [Risk Rules and Alert Lifecycle](#risk-rules-and-alert-lifecycle)
- [Machine Learning Forecasting Engine](#machine-learning-forecasting-engine)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Further Documentation](#further-documentation)
- [Data Attribution](#data-attribution)

---

## Key Capabilities

- **Real-Time Telemetry Ingestion:** Ingests dissolved oxygen (DO in mg/L), pH, temperature (°C), and water level (m). Live and simulated readings pass through the identical validation, risk classification, and alert pipeline.
- **Strict Risk Evaluation:** Independent evaluation of DO, pH, and temperature. Dissolved oxygen boundaries:
  
  | Value | Status | Action |
  |---|---|---|
  | `< 2.0 mg/L` | `CRITICAL` | Immediate danger; aerators required |
  | `2.0 – < 3.0 mg/L` | `WARNING` | Approaching danger; intervention advised |
  | `≥ 3.0 mg/L` | `NORMAL` | Healthy oxygenation; no alert |

  Stale readings (older than 60 minutes) are flagged as `STALE`, never masked as healthy.
- **3D Digital Twin Farm:** Interactive WebGL/Three.js farm visualization representing all 17 ponds with realistic water shaders, status-colored rim lighting, 3D billboard labels, and click-to-inspect drawers.
- **Standardized Pond Management:** Clean, sequential names (**Pond 1** through **Pond 17**) across all UI views, API responses, alerts, and 3D slots, while preserving raw sensor device IDs (`ara2_*`) in `sourceId` for complete auditability.
- **Persistent Alert Lifecycle:** One open alert per condition, automatic severity escalation (`WARNING` → `CRITICAL`), operator acknowledgement, automatic resolution upon water recovery, and immutable audit history.
- **ML Forecasting:** Pinned scikit-learn models predict DO, pH, and temperature at **+15, +60, and +180 minutes** ahead, triggering predictive warnings before hypoxia occurs.
- **Historical Pond Replay:** Deterministic 24-hour and 7-day replay of 72,700+ observations from the Fish Welfare Initiative research campaign with simulated live ML forecasts.

---

## System Architecture

```
                    +------------------------------------+
 hardware sensors / |  Node.js + Express API             |   Next.js 16 Dashboard
 simulated telemetry|  backend/                          | <------------------------
       ---------->  |  validate -> persist -> classify   |   (Three.js 3D Twin)
                    |  -> alert engine -> inference      |
                    +---------+------------------+-------+
                              |                  |  JSON-lines over stdio
                              v                  v  (isolated subprocess)
                    +------------------+  +-------------------------------+
                    |  MongoDB Atlas   |  | Python Worker (ml/)           |
                    |  db: aquaguard   |  | hash-pinned scikit-learn pkl  |
                    +------------------+  +-------------------------------+
```

- **Backend:** Node.js 22+, Express 4, Zod schema validation, official MongoDB driver v6.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Three.js / React Three Fiber / Drei, Recharts.
- **Database:** MongoDB Atlas (database `aquaguard`). 7 collections with strict JSON Schema validators and compound indexes.
- **ML Worker:** Hash-pinned Python 3.13 process communicating over stdio without network exposure.

---

## Repository Layout

```
.
├── backend/                     REST API server (port 4000)
│   ├── .env / .env.example      API, database, ML and risk-rule settings (.env is git-ignored)
│   ├── scripts/dev-local.js     In-memory local stack for instant demos & testing
│   ├── src/
│   │   ├── config/              Environment configuration & threshold rules
│   │   ├── routes/              Express HTTP routes
│   │   ├── services/            Risk, alerts, ingestion, inference, replay, queries
│   │   ├── validators/          Zod request & parameter schemas
│   │   ├── ml/                  Python subprocess client
│   │   └── server.js            HTTP server bootstrap
│   └── tests/                   Unit & integration test suites
├── frontend/                    Next.js web dashboard (port 3000)
│   ├── .env.local / .env.example Dashboard URLs and time zone (.env.local is git-ignored)
│   ├── src/
│   │   ├── app/                 App Router pages (Overview, Ponds, Alerts, Replay, Status)
│   │   ├── components/
│   │   │   ├── twin/            3D Digital Twin (React Three Fiber / Three.js)
│   │   │   ├── charts/          Recharts telemetry & prediction visualizers
│   │   │   └── fleet/           Pond cards, tables, and badge components
│   │   └── lib/                 API client, fleet normalization, and color constants
│   └── tests/                   Vitest component & utility tests
├── database/                    MongoDB schema validators, indexes & migration scripts
│   ├── lib/                     Connection pool, FWI dataset mappings
│   ├── schemas/                 Collection JSON Schema validators
│   ├── indexes/                 Index definitions for high-throughput queries
│   ├── scripts/                 Setup, seed, check, verify, and name-standardization scripts
│   └── fixtures/                Tagged demo data for offline testing
├── ml/                          Python ML inference worker & model bundle
│   ├── worker.py                JSON-lines stdio inference worker
│   ├── aquaguard_*.py           Feature extraction & prediction pipeline
│   ├── MODEL_SHA256             SHA-256 integrity hash of aquaguard_model.pkl
│   └── requirements.txt         Pinned Python dependencies
├── docs/
│   └── DATASET_AND_MODEL.md     Dataset inventory, schema mappings & model validation
└── aquaguard_model.pkl          Trained scikit-learn model bundle
```

---

## Quick Start

### Option A: Instant Local Demo (Zero Setup)

Run AquaGuard with an isolated in-memory database pre-loaded with historical data. **No MongoDB cluster or external credentials required.**

> [!TIP]
> Always run these commands from the **repository root directory**.

```bash
# 1. Install dependencies (Node.js 22+ & Python 3.13)
npm install
pip install -r ml/requirements.txt

# 2. Terminal 1: Start the Local Backend (Port 4000)
npm run dev:local
# Wait until you see: "AquaGuard API listening on http://127.0.0.1:4000 (database: LOCAL ephemeral)"

# 3. Terminal 2: Start the Web Dashboard (Port 3000)
npm run dev:frontend
```

Once running:
- **Dashboard:** Open [http://localhost:3000](http://localhost:3000) in your browser.
- **API Health:** Verify via `curl http://127.0.0.1:4000/api/health` (returns `"database":{"status":"up","target":"local"}`).
- **Stop:** Press `Ctrl+C` in both terminals. The local database is discarded on exit.

---

### Option B: Production / MongoDB Atlas Setup

Connect to a persistent MongoDB Atlas cluster:

```bash
# 1. Install dependencies
npm install
pip install -r ml/requirements.txt

# 2. Configure environment
cp backend/.env.example backend/.env
# Open backend/.env and set MONGODB_URI to your MongoDB Atlas connection string:
# MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/aquaguard?retryWrites=true&w=majority

# 3. Initialize database collections & indexes (safe to rerun)
npm run db:ping -w database              # Test connection
npm run db:init -w database              # Create collections & schema validators
npm run db:indexes -w database           # Apply compound indexes
npm run db:check -w database             # Verify database structure

# 4. Standardize pond names to 'Pond 1' ... 'Pond 17' (if migrating an existing database)
npm run db:standardize-names -w database

# 5. (Optional) Import historical FWI campaign data
node database/scripts/import-fwi.js --dir <path-to-csvs> --write

# 6. Terminal 1: Start the Backend API (Port 4000)
npm start

# 7. Terminal 2: Start the Web Dashboard (Port 3000)
npm run dev:frontend
```

---

### Directory & Terminal Guidance

| From Repository Root | Equivalent inside `backend/` | Equivalent inside `frontend/` | Equivalent inside `database/` |
|---|---|---|---|
| `npm run dev:local` | `node scripts/dev-local.js` | — | — |
| `npm start` | `npm start` | — | — |
| `npm run dev:frontend` | — | `npm run dev` | — |
| `npm test` | `npm test` | `npm test` | `npm test` |
| `npm run db:check -w database` | — | — | `npm run db:check` |
| `npm run db:standardize-names` | — | — | `npm run db:standardize-names` |

> [!IMPORTANT]
> - Do not run `npm start` and `npm run dev:local` simultaneously; both bind to port `4000`.
> - Check which database is serving at any time: `curl http://127.0.0.1:4000/api/health` indicates `"target":"local"` or `"target":"remote"`.

---

## 3D Digital Twin (Farm View)

AquaGuard includes an interactive **3D Digital Twin** built with **Three.js**, **@react-three/fiber**, and **@react-three/drei** that represents the aquaculture facility.

- **Pond Layout:** 17 physical pond platforms arranged in a structured farm grid with earthen berms and animated water surfaces.
- **Real-Time Status Rim Lights:**
  - 🟢 **Emerald (`NORMAL`):** Healthy dissolved oxygen, pH, and temperature.
  - 🟡 **Amber (`WARNING`):** Sub-optimal parameter approaching danger thresholds.
  - 🔴 **Crimson (`CRITICAL`):** Severe parameter violation (e.g. DO `< 2.0 mg/L`).
  - 🟣 **Purple (`PREDICTED_RISK`):** ML model forecasts upcoming critical hypoxia.
  - ⚪ **Slate (`STALE` / `NO_DATA`):** Missing or overdue telemetry.
- **Interactive Billboard Badges:** Elevated 3D markers show **Pond 1** through **Pond 17** with current DO readings.
- **Click-to-Inspect:** Clicking any pond in the 3D scene rotates the camera to that pond and slides out a telemetry drawer with real-time stats, time-series sparklines, and a direct link to the pond's detail page.
- **Controls & Performance:**
  - Smooth orbit, pan, and zoom controls.
  - One-click camera reset to top-down farm view.
  - **2D Plan View Toggle:** Instant fallback for low-power devices.
  - **Demo Fixtures Mode:** Append `/?twin=demo` to the URL to inspect labelled demo states (healthy, warning, critical, and forecasted risk).

---

## Standardized Pond Naming (Pond 1 – Pond 17)

To ensure clarity for farm operators, AquaGuard standardizes the 17 aquaculture ponds to sequential names: **Pond 1, Pond 2, Pond 3, … Pond 17**.

### Architecture & Separation of Concerns

1. **Display Name (`name`):** Strictly **Pond 1** through **Pond 17**. Used across the 3D twin, hover tooltips, farm overview, pond list, pond detail headers, alerts page, and replay selectors.
2. **Database Primary Key (`_id`):** Immutable MongoDB `ObjectId`. Unaltered during name normalization.
3. **Source Sensor Identifier (`sourceId`):** The underlying hardware or dataset tag (e.g., `ara2_0677080b`). Kept permanently on the pond document to guarantee provenance and support future imports.
4. **3D Twin Slot (`slot`):** 0-indexed layout position (0 to 16) corresponding to **Pond 1** through **Pond 17**.

### Deterministic Fleet Mapping

| Display Name | Source Identifier (`sourceId`) | 3D Twin Slot |
|---|---|---|
| **Pond 1** | `ara2_0677080b` | Slot 0 |
| **Pond 2** | `ara2_0f143c64` | Slot 1 |
| **Pond 3** | `ara2_148f1633` | Slot 2 |
| **Pond 4** | `ara2_176528d3` | Slot 3 |
| **Pond 5** | `ara2_29660d32` | Slot 4 |
| **Pond 6** | `ara2_3b2f3973` | Slot 5 |
| **Pond 7** | `ara2_3eab831e` | Slot 6 |
| **Pond 8** | `ara2_3ed4df8e` | Slot 7 |
| **Pond 9** | `ara2_45e1cde5` | Slot 8 |
| **Pond 10** | `ara2_4f79fc8d` | Slot 9 |
| **Pond 11** | `ara2_573a2826` | Slot 10 |
| **Pond 12** | `ara2_6ca69422` | Slot 11 |
| **Pond 13** | `ara2_858b914c` | Slot 12 |
| **Pond 14** | `ara2_b3d128ac` | Slot 13 |
| **Pond 15** | `ara2_c9cdacda` | Slot 14 |
| **Pond 16** | `ara2_ca187575` | Slot 15 |
| **Pond 17** | `ara2_d52ddb31` | Slot 16 |

### Name Migration Script

To update an existing MongoDB database to standardized pond names without modifying IDs or measurements:

```bash
npm run db:standardize-names -w database
```

---

## Web Dashboard Pages

The web dashboard is organized into clear operational views:

1. **Overview (`/`):**
   - High-level farm health banner (total ponds, active alerts, stale monitors).
   - **3D Digital Twin Farm View** with interactive pond inspection.
   - Quick alerts summary.
2. **Ponds (`/ponds`):**
   - Grid cards and compact table view of all 17 ponds.
   - Natural numeric sorting (**Pond 1** ... **Pond 17**).
   - Filter by status (`ALL`, `ATTENTION`, `NORMAL`, `STALE`).
3. **Pond Details (`/ponds/[id]`):**
   - Live telemetry status badges (DO, pH, Temperature, Water Level).
   - Historical time-series charts with gap detection (readings spaced > 20 min display breaks).
   - Forward prediction cards ("What may happen next?") for +15m, +60m, and +180m horizons.
   - Pond alert history.
4. **Alerts (`/alerts`):**
   - Unified alert management table (Active, Acknowledged, and Resolved history).
   - One-click alert acknowledgement ("Mark as seen").
5. **Compare Ponds (`/compare`):**
   - Side-by-side telemetry overlays of multiple ponds over selectable time ranges.
6. **Demo & Simulation (`/simulation`):**
   - **Replay History:** Select any pond and replay a 24-hour or 7-day historical window with speed controls (1x to 60x). Completely read-only.
   - **Test an Alert:** Guided 4-step simulator that triggers live warning, escalation, and resolution sequences on the local database.
7. **System Status (`/status`):**
   - Real-time diagnostic monitors for API uptime, database latency, and Python ML worker health.

---

## Configuration

Configuration is managed with environment variables, kept next to the code that reads them: **`backend/.env`** (API, database connection, ML worker, risk rules, import; template `backend/.env.example`) and **`frontend/.env.local`** (dashboard URLs and time zone; template `frontend/.env.example`, optional for local development). The database scripts share `backend/.env`. Real env files are git-ignored; the `.env.example` files are tracked. The table below lists the backend variables:

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(required)* | MongoDB Atlas connection string. Server-side only. |
| `MONGODB_DB` | `aquaguard` | Target database name. |
| `PORT` | `4000` | Express API HTTP port. |
| `HOST` | `127.0.0.1` | Express API bind host. |
| `NODE_ENV` | `development` | `production` disables test/demo endpoints. |
| `CORS_ORIGINS` | `localhost,127.0.0.1` (3000, 5173, 8081) | Allowed browser origins. |
| `DEMO_ENABLED` | `true` | Enables `/api/demo/*` endpoints (disabled in production). |
| `STALE_AFTER_MINUTES` | `60` | Duration without telemetry before status is marked `STALE`. |
| `MAX_QUERY_RANGE_DAYS` | `366` | Maximum allowed query window for telemetry queries. |
| `ML_ENABLED` | `true` | Enables the Python ML forecasting worker. |
| `PYTHON_BIN` | `python3` | Python binary used to launch `ml/worker.py`. |
| `ML_TIMEOUT_MS` | `30000` | Inference request timeout (milliseconds). |
| `AQUAGUARD_MODEL_PATH` | `aquaguard_model.pkl` | Path to the trained model bundle. |
| `AQUAGUARD_THRESHOLDS` | *(none)* | Optional path to custom JSON risk thresholds file. |

---

## Database & Management Scripts

Database: `aquaguard`. All timestamps are stored as UTC BSON `Date` objects.

### Collections

| Collection | Description | Key Indexes |
|---|---|---|
| `users` | Farm operator metadata | `_id` |
| `ponds` | Pond metadata (`name`, `sourceId`, `status`) | `_id`, `sourceId` |
| `measurements` | Time-series observations with source and provenance | `(pondId, timestamp DESC)`, `(pondId, parameter, timestamp DESC)` |
| `predictions` | ML forecasts (kept strictly separate from measurements) | `(pondId, timestamp DESC)` |
| `alerts` | Persistent alert lifecycle documents with `openKey` | `openKey` (unique sparse), `(pondId, status, timestamp)` |
| `notificationDeliveries` | Logged alert deliveries | `(alertId, timestamp)` |
| `modelRuns` | Audit log of ML inference executions | `(pondId, timestamp)` |

### Maintenance Scripts

Run these scripts from the repository root using `-w database`:

| Command | Action |
|---|---|
| `npm run db:ping -w database` | Ping MongoDB and verify credentials |
| `npm run db:init -w database` | Create collections and register JSON Schema validators |
| `npm run db:indexes -w database` | Create all required compound and unique indexes |
| `npm run db:check -w database` | Read-only check verifying collections, validators, and indexes |
| `npm run db:standardize-names -w database` | Rename raw hashes (`ara2_*`) to **Pond 1** through **Pond 17** |
| `npm run db:seed -w database` | Insert sample test fixtures (idempotent, rerun-safe) |
| `npm run db:unseed -w database` | Remove seeded fixtures (dry run by default; use `-- --confirm`) |
| `npm run db:verify -w database` | End-to-end verification of validation rules and alert lifecycles |

---

## Historical Data Import

The import script `database/scripts/import-fwi.js` loads Fish Welfare Initiative continuous-monitor CSVs (`ara2_*.csv`):

- **Dry-Run by Default:** Inspects files and prints an action summary without writing to the database:
  ```bash
  node database/scripts/import-fwi.js --dir <path-to-csvs>
  ```
- **Persist to Database:** Add `--write` to write data:
  ```bash
  node database/scripts/import-fwi.js --dir <path-to-csvs> --write
  ```
- **Idempotent & Deterministic:** Rows use a deterministic SHA-1 content hash; rerunning skips already-imported records. Conflicting records exit with error code 2.
- **Sensor Artifact Filtering:** Exact-zero values (sensor disconnects) are safely omitted while preserving valid sibling measurements in the same reading.
- **Verification:** Run verification against CSV sources:
  ```bash
  node database/scripts/verify-import.js --dir <path-to-csvs>
  ```

---

## REST API Reference

All endpoints are hosted under `/api`. Standard responses follow `{ "data": ... }` and errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check (service status, database connectivity, and ML worker state) |
| `GET` | `/risk-rules` | Active risk rules, thresholds, units, and rule-set version |
| `GET` | `/ponds` | List all ponds with standardized names and latest status |
| `GET` | `/ponds/:id` | Get metadata for a specific pond |
| `GET` | `/ponds/:id/summary` | Get latest telemetry values, active status, and open alerts |
| `GET` | `/ponds/:id/measurements` | Paginated historical measurements (newest first) |
| `GET` | `/ponds/:id/measurements/latest` | Latest reading for each parameter with age and staleness |
| `POST` | `/measurements` | Ingest new measurement (evaluates risk and triggers alert pipeline) |
| `GET` | `/ponds/:id/predictions` | Latest ML forecasts with forward risk evaluation |
| `GET` | `/ponds/:id/alerts` | Alert history for a specific pond |
| `GET` | `/alerts` | Global alert query (filter by `status`, `severity`, `parameter`, `pondId`) |
| `PATCH`| `/alerts/:id/acknowledge` | Acknowledge an active alert |
| `GET` | `/ponds/:id/analytics` | Statistical aggregates and time-bucket distributions |
| `GET` | `/analytics/compare` | Compare metrics across multiple ponds |
| `GET` | `/replay/ponds` | List ponds with available historical replay data |
| `GET` | `/replay/ponds/:id` | Get 24-hour and 7-day replay presets for a pond |
| `GET` | `/replay/ponds/:id/window` | Fetch read-only chronological historical telemetry window |
| `POST` | `/replay/forecast` | Run ML forecast on historical point-in-time data (read-only) |
| `GET` | `/demo/scenarios` | List interactive demo scenarios (when `DEMO_ENABLED=true`) |
| `POST` | `/demo/measurement` | Ingest simulated measurement for demo testing |

---

## Historical Replay & Simulation

The **Demo & Simulation** page allows operators and researchers to replay real historical pond behavior as it occurred.

- **Data Integrity:** Replays strictly use recorded `historical` data. Gaps exceeding 20 minutes render as visual breaks on charts.
- **Strict Isolation:** Replay is **100% read-only**. It never writes measurements, never stores predictions, and never mutates alert state in the database.
- **Point-in-Time Inference:** When replaying, the ML forecasting worker is invoked using only data timestamped *prior* to that moment, simulating real-world predictive warnings.
- **Works on Both Databases:** Replay works against both local in-memory data and MongoDB Atlas.

---

## Risk Rules and Alert Lifecycle

### Strict Threshold Boundaries

Risk rules reside in `backend/src/services/risk.js` and are broadcast to clients via `GET /api/risk-rules`. The frontend maintains no local threshold copies.

| Parameter | Acceptable Range | WARNING | CRITICAL |
|---|---|---|---|
| **Dissolved Oxygen** | `≥ 3.0 mg/L` | `2.0 – < 3.0 mg/L` | `< 2.0 mg/L` |
| **pH** | `6.5 – 8.5` | `< 6.5` or `> 8.5` | `< 6.0` or `> 9.0` |
| **Temperature** | `20.0 – 32.0 °C` | `< 20.0` or `> 32.0 °C` | `< 15.0` or `> 35.0 °C` |

> [!NOTE]
> Boundaries are strictly evaluated. A dissolved oxygen reading of exactly `3.0 mg/L` is `NORMAL`, while `2.0 mg/L` is `WARNING`. Values `< 2.0 mg/L` are `CRITICAL`.

### Alert Lifecycle State Machine

1. **Open:** When a reading enters `WARNING` or `CRITICAL`, an alert document is opened with state `ACTIVE`. An `openKey` index guarantees only one open alert exists per pond, parameter, side, and source.
2. **Escalate:** If an existing `WARNING` alert receives a subsequent `CRITICAL` reading, it escalates in place. An acknowledged alert returns to `ACTIVE`.
3. **Acknowledge:** An operator marks an alert as seen via `PATCH /api/alerts/:id/acknowledge`. Its status transitions to `ACKNOWLEDGED`. The problem remains open.
4. **Auto-Resolve:** When a new reading arrives within the `NORMAL` range, the alert automatically transitions to `RESOLVED` and is preserved in history.
5. **Channel Isolation:** An invalid sensor value (e.g. pH 99) in one parameter does not discard valid sibling measurements (e.g. DO 4.5 mg/L) in the same ingestion payload.

---

## Machine Learning Forecasting Engine

- **Model Bundle:** `aquaguard_model.pkl` (`aquaguard-2026-10-10-2b5b58b4`), trained on cleaned aquaculture campaign telemetry.
- **Forecasting Horizons:** 15, 60, and 180 minutes for DO, pH, and water temperature.
- **Input Requirements:** Requires at least 24 hours of 15-minute historical readings for the pond.
- **Worker Process:** Started lazily by Node.js as an isolated child process (`ml/worker.py`).
- **Security Hash Pinning:** To prevent arbitrary code execution vulnerabilities from untrusted pickles, `worker.py` verifies the exact SHA-256 hash of `aquaguard_model.pkl` against `ml/MODEL_SHA256` before loading.
- **Resilient Fallback:** If Python or the model is unavailable, telemetry ingestion and real-time threshold alerts continue operating without interruption.

---

## Testing & Quality Assurance

AquaGuard maintains an automated test suite across all three workspaces:

```bash
# Run all test suites across backend, database, and frontend
npm test

# Run backend unit tests (no database or Python required)
npm run test:unit -w backend

# Run backend integration tests (starts ephemeral local MongoDB)
npm run test:integration -w backend

# Run frontend tests (Vitest)
npm test -w frontend

# Run frontend linting & TypeScript type checking
npm run lint -w frontend
npm run typecheck -w frontend

# Verify frontend production build
npm run build:frontend
```

---

## Security

- **Database Credentials:** `MONGODB_URI` is accessed strictly server-side. It is never exposed in client bundles or forwarded to child processes, and error handlers sanitize URIs before logging.
- **Model Integrity:** `ml/worker.py` validates the SHA-256 hash of `aquaguard_model.pkl` against `ml/MODEL_SHA256` before deserialization.
- **CORS Protection:** Configurable via `CORS_ORIGINS` to allow only trusted web origins.
- **Payload Limits:** Request bodies are strictly restricted to 20 kB. Query parameters and date ranges are capped to prevent denial-of-service queries.
- **No Production Auth:** AquaGuard is currently configured for trusted local intranet environments. Authentication and rate-limiting must be applied before exposing to the public internet.

---

## Known Limitations

- **Stale Historical Data:** Because the source FWI research campaign ended in January 2026, all imported historical ponds naturally show `STALE` in real-time mode today. Use the **Demo & Simulation** page to observe live dynamics.
- **Thresholds are Defaults:** The pH and temperature threshold bounds are demo values for software evaluation. Calibrate limits to specific target aquatic species before production deployment.
- **Forecast Alerts:** Machine learning predictive alerts are currently enabled for dissolved oxygen.

---

## Further Documentation

- [Frontend Documentation](file:///Users/anudeepreddyveerati/Lassiii/Aquafix/frontend/README.md): Next.js App Router details, 3D Digital Twin setup, component rules, and UI testing.
- [Backend Documentation](file:///Users/anudeepreddyveerati/Lassiii/Aquafix/backend/README.md): REST API contracts, alert state machine, and ML worker protocol.
- [Database Documentation](file:///Users/anudeepreddyveerati/Lassiii/Aquafix/database/README.md): Collection schemas, index rationale, and maintenance scripts.
- [Dataset & Model Specification](file:///Users/anudeepreddyveerati/Lassiii/Aquafix/docs/DATASET_AND_MODEL.md): Historical FWI dataset inventory, column mapping, and ML model evaluation.

---

## Data Attribution

The continuous-monitoring aquaculture dataset used in AquaGuard is provided by the [Fish Welfare Initiative (FWI)](https://www.fishwelfareinitiative.org/) and is shared for research and early-warning safety engineering.
