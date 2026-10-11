# AquaGuard backend

Node.js + Express REST API, the single source of truth for measurements, predictions, risk classification and alerts. MongoDB Atlas is the store (via the shared `database/lib/connect.js`); the existing Python model runs in a child process. No auth/roles: one farmer, many ponds (see *Security*).

```
backend/src
  config/        env-based config            routes/        one router (thin handlers)
  services/      risk, alerts, ingestion, inference, queries, analytics, demo
  validators/    zod input schemas           middleware/    logger, error handling
  ml/            Python worker client        utils/         errors, params, ids/cursors
  app.js (createApp, dependency-injected)    server.js (process entry)
```
(Controllers are folded into `routes/` + `services/`; there are no repositories, services use the driver directly.)

## Run
```bash
cp .env.example .env            # fill MONGODB_URI (rotate the password first if it was ever shared)
npm install                     # repo root (npm workspaces: database + backend)
pip install -r ml/requirements.txt   # scikit-learn 1.8.0, numpy, pandas, joblib
npm run db:init -w database && npm run db:indexes -w database      # collections, validators, indexes (idempotent)
npm start                       # API on http://127.0.0.1:4000/api ; spawns the Python inference worker lazily
```
Local development without Atlas: `npm run dev:local` (ephemeral database with the historical data, API on :4000). It refuses to start unless the database target is loopback, and the startup banner and `/api/health` show `LOCAL` / `"target":"local"`. `npm start` prints `REMOTE` when it uses Atlas. Both use port 4000; if the port is taken the second one exits with a clear message instead of sharing it.

Historical import: `node database/scripts/import-fwi.js --dir <Preprocess/csv>` (dry run), add `--write` to persist, then `node database/scripts/verify-import.js --dir <Preprocess/csv>`.

Tests: `npm test` (root) = backend unit + integration + database tests. Unit tests need nothing; integration tests start an **ephemeral local mongod** (mongodb-memory-server; first run downloads a binary) and never touch Atlas. The real-model test needs Python deps and `~/Preprocess/csv/ara2_4f79fc8d.csv`, otherwise it skips.

## Pipeline (`POST /api/measurements`, also used by `/api/demo/measurement`)
validate (zod: units, bounds, ISO time with zone) → resolve pond → persist → classify → alert lifecycle → optional inference → response.
* Optional ML failures never roll back the measurement or the threshold alerts; they are recorded in `modelRuns` and reported as `inference.status` (`ok | disabled | skipped | insufficient_history | unavailable`).
* Only the newest reading per pond+source drives alert state; older (out-of-order) readings are stored but change nothing.
* `idempotencyKey` makes retries safe (`200` + `duplicate: true`; alert evaluation is re-run idempotently).

## Risk rules (`src/services/risk.js`, the only place on the backend)
Dissolved oxygen: `< 2.0` CRITICAL, `2.0 ≤ x < 3.0` WARNING, `≥ 3.0` no warning (strict comparisons; tests at 1.9/2.0/2.9/3.0, and a test keeps these equal to `ml/aquaguard_config.py`). These are the project's defaults, **not validated species-specific limits**. pH, temperature and water level have no validated rules, so they classify `UNKNOWN` (stored, no alerts). Missing data → `NO_DATA`; a latest DO reading older than `STALE_AFTER_MINUTES` (60, the model's own freshness window) → `STALE`. Neither is ever "healthy". The Aquademo values are not used.

## Alert lifecycle (`alerts` collection, unique partial index on `openKey`)
`openKey = <pondId>:<observed|predicted>:<parameter>:<historical|simulated|live>` exists only while the alert is open, so there is at most one open alert per condition; simulated demo readings can never resolve a live alert.
* **open** on first WARNING/CRITICAL; **update** (`lastTriggeredAt`, `triggerValue`, severity) on repeats, no duplicates.
* **escalate** WARNING→CRITICAL; an ACKNOWLEDGED alert that escalates returns to ACTIVE.
* **acknowledge** (`PATCH /api/alerts/:id/acknowledge`): ACTIVE→ACKNOWLEDGED; the condition stays open. Idempotent; `409` if already resolved.
* **resolve** when a newer reading is back to NORMAL: status RESOLVED, `resolvedAt` set, `openKey` removed; the document stays as history and a later episode opens a new alert.
* **predicted** alerts come from the worst DO forecast across horizons (same rules, `origin: "predicted"`, message starts with `FORECAST`); they resolve when forecasts recover, and are left untouched when no forecast is available.

## Endpoints (all under `/api`, JSON)
| Method & path | Notes |
|---|---|
| `GET /health` | `{status: ok｜degraded｜down, database:{status, target: local｜remote｜unknown}, ml:{status: ready｜unavailable｜disabled}}`; `503` if the DB is down. `target` says whether the database is on this machine (every host is loopback) without revealing the host or URI. |
| `GET /risk-rules` | `{dissolvedOxygen:{unit,criticalBelow,warningBelow}, unclassifiedParameters, staleAfterMinutes, note}`: the rules the backend applies, for clients to display instead of duplicating |
| `GET /ponds`, `GET /ponds/:id` | pond metadata (`sourceId` for imported ponds) |
| `GET /ponds/:id/summary` | `riskStatus` (CRITICAL｜WARNING｜NORMAL｜STALE｜NO_DATA, based on DO), per-parameter latest value + age + `dataState`, open alert counts |
| `GET /ponds/:id/measurements` | newest first. Query: `from`,`to` (ISO, max range 366 d), `parameter`, `source` (`historical｜simulated｜live`), `limit` (≤1000, default 100), `cursor` → `{items,count,nextCursor}` |
| `GET /ponds/:id/measurements/latest` | latest value per parameter with `ageMinutes`, `stale`, `source` |
| `POST /measurements` | body below; `201` created / `200` duplicate / `422` / `404` |
| `GET /ponds/:id/predictions` | latest batch (`?history=true` for all; `?parameter=`); model forecasts, not measurements |
| `GET /ponds/:id/alerts`, `GET /alerts` | `status` = `OPEN`(default)｜`ACTIVE`｜`ACKNOWLEDGED`｜`RESOLVED`｜`ALL`, `origin`, `limit`, `cursor` |
| `PATCH /alerts/:id/acknowledge` | `{alert, changed}` |
| `GET /ponds/:id/analytics` | `parameter`, `from`,`to` (default: 7 days ending at the pond's newest reading), `source`, `bucket=none｜hour｜day` → summary (count/min/max/mean/first/last/change/OLS `slopePerHour`) and UTC buckets of **observed** points only (no filling/interpolation) |
| `GET /analytics/compare` | same stats for several ponds over one range (`pondIds=a,b,…` optional) |
| `GET /demo/scenarios`, `POST /demo/measurement` | only when `DEMO_ENABLED`; see below |

Every record carries `source` (`historical｜simulated｜live`); historical records also carry `provenance` (dataset, original timestamp text, zone, QC flags, data-quality notes). Timestamps are ISO-8601 UTC.

`POST /api/measurements`
```json
{ "pondId": "6a…", "source": "live", "recordedAt": "2026-03-01T11:30:00Z",
  "idempotencyKey": "dev1-0001",
  "values": [ {"parameter":"dissolved_oxygen","value":1.8,"unit":"mg/L"}, {"parameter":"ph","value":7.9} ] }
```
parameters: `dissolved_oxygen` (mg/L), `ph` (pH), `temperature` (C or °C), `water_level` (m). `source`: `live` (default) or `simulated`; `recordedAt` defaults to now and must carry a timezone and not be >5 min in the future. Physically impossible values (DO outside 0–50, pH 0–14, temp −5–60, level 0–50) are rejected; unhealthy-but-possible values are not.
```json
201 { "duplicate": false,
  "measurement": {"id":"…","pondId":"…","recordedAt":"…","receivedAt":"…","source":"live","values":[…]},
  "risk": {"dissolved_oxygen":{"value":1.8,"unit":"mg/L","status":"CRITICAL","threshold":2},
           "ph":{"value":7.9,"unit":"pH","status":"UNKNOWN","note":"no validated threshold configured for this parameter"}},
  "alerts": [{"parameter":"dissolved_oxygen","action":"opened","alertId":"…"}],   // opened|updated|escalated|resolved|none
  "alertStateUpdated": true,
  "inference": {"status":"ok","runId":"…","predictions":9,"warnings":[…],"predictedAlert":{"action":"none"}} }
```
Errors share one shape: `{"error":{"code":"VALIDATION_ERROR","message":"…","details":[{"path":"values.0.value","message":"…"}]}}` with codes `BAD_REQUEST 400`, `NOT_FOUND 404`, `CONFLICT 409`, `PAYLOAD_TOO_LARGE 413`, `VALIDATION_ERROR 422`, `INTERNAL_ERROR 500` (no stack traces).

**Demo** `POST /api/demo/measurement` `{ "pondId":"…", "scenario":"healthy｜warning｜critical" }` (DO 5.2 / 2.7 / 1.8 mg/L) or `{ "dissolvedOxygen": 2.4 }`, optionally with `"ph": 7.4` and/or `"temperature": 28` (°C) in the same request, and an optional `recordedAt`. At least one value is required; `scenario` and `dissolvedOxygen` are mutually exclusive. The values are stored together as one `simulated` measurement and validated by the same rules as `POST /api/measurements` (pH 0-14, temperature -5-60 °C, DO 0-50 mg/L). Only dissolved oxygen is classified and can raise alerts; pH and temperature are stored and returned with status `UNKNOWN`. It calls the same `ingestMeasurement` as normal ingestion with `source: "simulated"` (no direct alert insertion); the response adds `demo: {simulated: true, scenario}`. These are explicit inputs, not claims about real ponds. To see forecasts, use a pond with ≥24 h of preceding history: e.g. an imported pond with `recordedAt` inside its historical range (the simulated value is then appended to that real history; the response warns that the forecast is simulated).

## Inference worker (`ml/worker.py`)
Spawned by the backend (`python3 -I ml/worker.py`), JSON lines over stdin/stdout, no network port, minimal environment, one model load per process, hash-pinned artifact (`ml/MODEL_SHA256`), 30 s timeout, killed and respawned on failure. Run standalone for a check: `echo '{"id":"1","op":"ping"}' | python3 ml/worker.py`. See `docs/DATASET_AND_MODEL.md`.

## Security / assumptions
`MONGODB_URI` is read only server-side and is not forwarded to the Python worker; error text is sanitized; logs contain method, path and status only (no query strings/bodies/headers); CORS limited to `CORS_ORIGINS`; body limit 20 kB; query ranges and page sizes capped; 500s hide internals. **There is no authentication**: the API is intended for a trusted local/dev network with one demo farmer. Before exposing it publicly add authentication and rate limiting, and set `NODE_ENV=production` (disables demo routes by default).

## Historical replay (read-only)

`GET /api/replay/ponds`, `GET /api/replay/ponds/:id` (coverage + valid 24 h / 7 d presets), `GET /api/replay/ponds/:id/window?from&to`
(chronological, de-duplicated `historical` records with backend risk per record; gaps reported, never filled) and
`POST /api/replay/forecast {pondId, at}` (real model run "as of" one historical record using only earlier history).
These endpoints never write: no measurements, predictions, model runs or alerts are created, so a replay cannot touch live alerts
and every request is safely repeatable. Code: `src/services/replay.js`; tests: `tests/integration/replay.test.js`.

## Risk rules and alerts for DO, pH and temperature

Rules, validation and defaults are documented in the root README ([Risk rules and alert lifecycle](../README.md#risk-rules-and-alert-lifecycle)). Implementation: `src/services/risk.js` (rules, `classify`, `loadRiskRules`, `observedMessage`, `pondOverallStatus`), `src/services/alerts.js` (`applyCondition`, `applyReading`: one open alert per pond, parameter, side and source) and `src/services/ingestion.js` (per-parameter newest-reading check, partial acceptance with `rejectedValues`). No database schema change: the alert side is derived as `direction` (`low` or `high`) from the stored trigger value and limit. Tests: `tests/unit/rules.test.js`, `tests/integration/alerts-multi.test.js`.

`GET /api/ponds/:id/predictions` items include `risk` (`NORMAL`, `WARNING`, `CRITICAL`) and `direction` (`low` or `high`), classified by the backend's active rules at read time, so clients never apply thresholds to forecast values. Forecast *alerts* still exist for dissolved oxygen only.
