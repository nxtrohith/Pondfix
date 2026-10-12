# AquaGuard database (MongoDB Atlas, database `aquaguard`)

Database-only phase: schemas, indexes, setup/verify scripts, sample fixtures. No server, API or UI code.

## Setup
1. In Atlas: rotate the DB user password if it was ever shared, and add your IP under Network Access.
2. Copy `../backend/.env.example` to `../backend/.env` and set `MONGODB_URI` (the database scripts share the backend's connection settings) (never commit it; `.env`, `.env.*`, `*.env` and `*credentials*` are git-ignored).
3. `cd database && npm install`
4. `npm run db:ping` → `db:init` → `db:indexes` → `db:check` → `db:seed` → `db:verify`

All scripts are rerunnable. None drop collections or delete data except `db:unseed --confirm`, which deletes only documents with `fixtureTag: "aquaguard-demo-v1"` (dry run without `--confirm`).
Errors are sanitized: the URI and password are never printed.

## Layout
`lib/connect.js` shared connection · `schemas/collections.js` validators · `indexes/indexes.js` index specs · `scripts/` · `fixtures/demo.js` sample data · `imports/` reserved for the historical import (see below).

## Collections (all timestamps are BSON dates, UTC)
| Collection | Purpose | Key fields |
|---|---|---|
| users | Single demo farmer | name, email?, createdAt, updatedAt |
| ponds | Pond metadata (only real/known fields) | userId→users, name, status, location?, area{value,unit}?, species? (legacy note), speciesProfileId?, cultureType?, customSpeciesName?, speciesComposition?, profileVersion?, speciesConfiguredAt? (absent = species not configured) |
| measurements | One observation of one pond | pondId, recordedAt (observed), receivedAt (system), source `historical｜simulated｜live`, values[{parameter,value,unit}], dedupKey? |
| predictions | Model forecasts, never measurements | pondId, parameter, predictedValue, unit, forecastFor, generatedAt, modelName?/modelVersion?/horizon?, sourceMeasurementIds?, modelRunId? |
| alerts | Persistent condition records | pondId, origin `observed｜predicted`, parameter, severity, triggerValue, threshold, message, status, lastTriggeredAt, ack/resolved timestamps, openKey |
| notificationDeliveries | Delivery attempts (no provider secrets) | alertId, channel, status, attemptedAt, deliveredAt?, errorCode? |
| modelRuns | Inference audit (no stack traces) | pondId, status, startedAt, completedAt?, inputMeasurementIds?, predictionIds?, errorCode? |

Measurement units: dissolved_oxygen `mg/L`, ph `pH`, temperature `C`, water_level `m`. Not every parameter must be present; a missing parameter is simply absent, never a default value. Validators reject only structurally invalid or physically impossible values (DO 0–25, pH 0–14, temp −5–60, level 0–50), not "unhealthy" ones.

## Relationships (references only; no unbounded embedding)
users 1─* ponds · ponds 1─* measurements / predictions / alerts / modelRuns · alerts 1─* notificationDeliveries · modelRuns 1─* predictions (`modelRunId`; run also lists `predictionIds`).

## Indexes
See `indexes/indexes.js` (each has a `purpose`). Highlights: `measurements(pondId, recordedAt↓)`, `predictions(pondId, parameter, forecastFor↓)`, `alerts(pondId, status, createdAt↓)`, `notificationDeliveries(alertId, attemptedAt↓)`.

## Deduplication and lifecycle
- Measurements: optional `dedupKey` with a *partial* unique index, so imports/ingest can be idempotent while legitimate repeat readings (no key) are never blocked.
- Alerts: `openKey = pondId:origin:parameter:dataSource` (backend format; the `dataSource` suffix keeps simulated demo readings from resolving live alerts) exists only while ACTIVE/ACKNOWLEDGED and is unique, giving at most one open alert per condition. Acknowledging sets status/acknowledgedAt only (condition stays open). Resolving sets `resolvedAt` and `$unset`s `openKey`; the document stays as history and a new episode may open a new alert.
- Predictions: unique on (pondId, parameter, forecastFor, generatedAt) so re-running one inference doesn't duplicate.
- Retention: no TTL indexes; nothing is auto-deleted.

## Added in the backend/import phase
- Species fields on `ponds` and alert classification snapshots on `alerts` (`ruleScope`, `speciesLabel`, `profileVersion`, …) are optional additions; run `npm run db:init` once on an existing database to update the validators (non-destructive `collMod`).
- `ponds.sourceId/sourceDataset` (unique partial index) and `measurements.provenance` (dataset, file, rowNumber, pondSourceId, original timestamp text + zone, QC flags, data-quality notes).
- DO physical bound widened to 0–50 mg/L (the real data reaches 25.56; unusual values are kept, not discarded).
- `predictions` also stores `dataSource`, `selectedModel`, `persistenceBaseline`, `typicalAbsError`, `absErrorQ90` (model-provided; no confidence is invented); `alerts` also stores `dataSource`, `horizonMinutes`, `forecastFor`.
- `scripts/import-fwi.js` (idempotent historical import, dry run by default) and `scripts/verify-import.js`; mapping in `../docs/DATASET_AND_MODEL.md`. `lib/connect.js` also exports `getDb()/closeDb()` for the backend; `lib/setup.js` holds the reusable init/index functions.
- Re-run `npm run db:init -w database && npm run db:indexes -w database` on an existing deployment to apply the validator/index changes (collMod, no data touched).

## Open items
- DO thresholds (CRITICAL < 2.0, WARNING < 3.0 mg/L) are implemented in the backend from the project's `ml/aquaguard_config.py`; they are project defaults, not validated species limits. pH/temperature/water level have none.
- Historical import is implemented for the FWI CSVs (see above).
- `aquaguard_model.pkl` is used by the backend's hash-pinned Python worker (never by these scripts).
