# Dataset inventory and ML model requirements

Findings from inspecting `~/Preprocess` (a git repo with Fish Welfare Initiative's public data plus the project's ML work). Source files were read only; nothing there was modified.

## Dataset inventory

| Path (under `Preprocess/`) | Format | Contents | Rows | Use |
|---|---|---|---|---|
| `csv/ara2_<8 hex>.csv` ×17 | CSV | **Raw continuous-monitor observations**, one file per pond: `Date/Time (IST)`, `DO (mg/L)`, `pH`, `Temperature (°C)`, `QC_Flag_DateTime`, `QC_Flag_DO`, `QC_Flag_pH` | 72,750 total (2,298–5,592 per pond) | **Historical storage (imported)** |
| `Data Campaign Data.xlsx` | XLSX | Same 17 time-series sheets + ProDSS/Photometer, Key Events, QC legend | – | Original of the CSVs; not imported separately |
| `csv/ProDSS_and_Photometer.csv`, `Key_Events.csv`, `QC_Flags.csv`, `*Comparison*.csv` | CSV | Handheld meter readings (DO/pH/temp/ammonia/chlorophyll-a), install/calibration events, QC legend, validation studies | small | Not imported (different instrument / metadata; ammonia and chlorophyll have no collection parameter yet) |
| `pond_timeseries_clean.csv` | CSV | **Processed** training table (grid-aligned, interpolated/filled copies, `*_was_interpolated` flags, QC bitmasks), 78,988 rows | 78,988 | ML training input only. **Not imported**: it contains interpolated values, which are not observations |
| `aquaguard_model.pkl` (repo root) = `artifacts/aquaguard_model.pkl` | joblib/pickle | Trained bundle (sha256 `87b590bf…b53b06`, byte-identical in both places) | – | ML inference |
| `aquaguard_best_model.pkl`, `do_forecast_models.pkl` | pickle | Earlier model versions | – | Not used |
| `*.py`, `tests/`, `docs/`, `MODEL_README.md`, metrics CSVs | – | Preprocessing, training, evaluation, inference code and reports | – | `aquaguard_common.py`, `aquaguard_inference.py`, `aquaguard_config.py` copied unchanged into `ml/` |

### Raw CSV details (measured)
- **Ponds:** 17 anonymised ids (`ara2_…`), identical to the public ARA dataset; no location/area/species metadata exists, so none was invented.
- **Timestamps:** `Date/Time (IST)` text, India Standard Time (fixed UTC+05:30). Nominal 15-minute cadence with jitter of seconds in some ponds. Range **2025-11-28 21:30 IST → 2026-01-30 23:45 IST** = 2025-11-28T16:00:00Z → 2026-01-30T18:15:39Z. Pond coverage is uneven (`ara2_858b914c` ends 2025-12-24; several start mid-December/January).
- **Parameters / units:** DO mg/L, pH (unitless), temperature °C. No water level.
- **Duplicates:** repeated timestamps with *different* values exist (224 in `ara2_3ed4df8e`, 34 in `ara2_6ca69422`); both observations are kept.
- **Exact zeros** (DO/pH/temp = 0): documented by the data publisher as equipment artifacts (device resets, outages; many on 2026-01-08). 17 rows are all-zero; other zeros affect single parameters (195 in `ara2_3ed4df8e`, 495 in `ara2_ca187575`, mostly pH).
- **Out-of-range:** DO up to 25.56 mg/L, pH 5.3–9.24, temp 20.6–36.0 °C. Source QC flags (`DO_jump_>2`, `DO_>10_before_noon`, `pH_out_of_range`, `time_gap_>20min`, `flyover_window`, …) are preserved with each record; no value is discarded for being unusual.
- **Missing values:** none in these CSVs (no empty cells); gaps appear as missing timestamps.

### Import mapping (`database/lib/fwi-mapping.js`, `database/scripts/import-fwi.js`)
| Source | → `measurements` |
|---|---|
| file name `ara2_xxxxxxxx.csv` | pond with `sourceId` = that id (created if absent, name = id, `status: active`, no invented metadata); `pondId` is a deterministic ObjectId |
| `Date/Time (IST)` | `recordedAt` = same instant in UTC (−05:30); original text kept in `provenance.sourceTimestamp`, zone in `provenance.sourceTimezone` |
| `DO (mg/L)`, `pH`, `Temperature (°C)` | `values[]` = `dissolved_oxygen` mg/L, `ph` pH, `temperature` C. One row = one observation because the source records all three at the same timestamp (temporal structure preserved). |
| exact `0` | that parameter is omitted and `provenance.dataQuality` gets `zero_value_artifact:<param>`; a row with no usable parameter is **rejected** and reported |
| QC flag columns | `provenance.qcFlags` e.g. `do:DO_jump_>2` |
| – | `source: "historical"`, `receivedAt` = import time, `provenance.{dataset,file,rowNumber,pondSourceId}` |
| identity | `dedupKey = fwi-satellite-campaign-2025-26:<pond>:<source timestamp text>[#n]` (`#n` for the n-th repeat of the same timestamp in a file) |

Import behaviour: dry run by default (`--write` to persist, `--offline` to skip the DB), batches of 1,000, never deletes or overwrites; identical existing records are skipped, differing ones are reported as conflicts (exit code 2). A JSON report goes to `database/reports/` (git-ignored). Attribution: data © Fish Welfare Initiative, shared for research; cite them when using it.

## ML model requirements (as documented and verified)

- **Bundle:** `aquaguard-2026-10-10-2b5b58b4`, feature schema hash `7eaea628caf61d1e`, trained by the project's own `aquaguard_train.py` on the cleaned data above (provenance: same-origin training run + identical hash).
- **Predicts:** DO (mg/L), pH, water temperature (°C) at **15, 60, 180 min** (direct models, HistGradientBoosting); longer horizons chain 3 h blocks (validated to DO 22 h 15 m, pH 13 h, temp 17 h 45 m; the backend only requests 15/60/180). **Not** supported: ammonia, turbidity, salinity, water level.
- **Inputs:** current reading (any subset of do/ph/temp) **plus ≥ 24 h of 15-minute history** for the same pond (`do_clean`, `ph_clean`, `temp_clean`, optional `qc_flyover_window`). A single reading is not enough; with less history the worker returns `INSUFFICIENT_HISTORY` and the API reports `inference.status = insufficient_history`.
- **Preprocessing inside the code (`aquaguard_common.make_grid`):** snap to 15 min, duplicates → median, zeros/limits (DO 0–20, pH 6–10, temp 15–35) → missing, flyover window → missing, no interpolation. Timestamps are interpreted in IST (tz-aware input is converted).
- **Output:** per horizon/parameter `value`, `unit`, `target_timestamp` (IST), `selected_model`, `persistence_baseline`, empirical `typical_abs_error` / `abs_error_q90` (validation-period error bands, **not** calibrated confidences; none is fabricated). Stale parameters are withheld, not guessed.
- **Known limits (from the model's own manifest):** one winter season (Nov–Jan), 17 ponds of one region; 15-min temperature forecasts are slightly worse than persistence; few hypoxia events; thresholds are project defaults, not validated species-specific limits.
- **Versions:** Python 3.13, scikit-learn 1.8.0, numpy 2.4.3, pandas 3.0.1, joblib 1.5.3 (`ml/requirements.txt`).
- **Security:** pickle executes code on load. The worker only loads a file whose SHA-256 equals `ml/MODEL_SHA256`, runs as a child process of the backend over stdio (no listening port) with `python -I` and a minimal environment (the Mongo URI is not passed to it).
