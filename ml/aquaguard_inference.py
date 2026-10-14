"""
AquaGuard AI - inference for DO, pH and water temperature.

    from aquaguard_inference import predict
    out = predict('ara2_4f79fc8d', recent_history_df, '2026-01-31 03:00')

`recent_history_df`: DataFrame / list of dicts with a timestamp column and DO, pH, temperature columns
(either the cleaned names do_clean / ph_clean / temp_clean or the raw 'DO (mg/L)', 'pH', 'Temperature (°C)').
Optional column qc_flyover_window (True rows are ignored). At least 24 h of grid span is required.

The forecast is issued at the last history timestamp (or `now`, if given and later). `requested_timestamp`
must lie on the 15-minute grid, after the issue time and within the validated horizon.
Unsupported horizons / insufficient history raise explicit errors; stale parameters are withheld, never guessed.
"""
import os
import warnings

import joblib
import numpy as np
import pandas as pd

import aquaguard_common as C

DEFAULT_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aquaguard_best_model.pkl')
_CACHE = {}

from aquaguard_config import DO_CRITICAL as LOW_DO_CRIT, DO_WARNING as LOW_DO_WARN, classify_do  # noqa: E402  (single source: aquaguard_config)
MIN_VALID_FRAC_WARN = 0.5
MIN_VALID_FRAC_WITHHOLD = 0.25


class ForecastError(ValueError):
    pass


class InsufficientHistoryError(ForecastError):
    pass


class UnsupportedHorizonError(ForecastError):
    pass


def load_artifact(path=None):
    """Load (and validate) a model bundle. `path` may also be an already-loaded bundle dict.
    SECURITY: .pkl files execute code on load - only load files you trained or trust."""
    if isinstance(path, dict):
        return _validate(path)
    path = path or DEFAULT_MODEL
    if path not in _CACHE:
        if not os.path.exists(path):
            raise FileNotFoundError(f'model artifact not found: {path}')
        _CACHE[path] = _validate(joblib.load(path))
    return _CACHE[path]


def _validate(art):
    for key in ('specs', 'feature_cols', 'max_validated_steps', 'params', 'error_bands'):
        if key not in art:
            raise ForecastError(f'artifact is missing required key {key!r}')
    if art['feature_cols'] != C.FEATURE_COLS:
        raise ForecastError('feature schema in artifact does not match aquaguard_common.FEATURE_COLS '
                            '(retrain or use the matching code version)')
    if art.get('sklearn_version') and art['sklearn_version'].split('.')[:2] != __import__('sklearn').__version__.split('.')[:2]:
        warnings.warn(f"artifact trained with scikit-learn {art['sklearn_version']}, running {__import__('sklearn').__version__}")
    return art


def _steps_between(issue, target):
    delta = (target - issue).total_seconds() / 60.0
    if delta <= 0:
        raise UnsupportedHorizonError(f'requested timestamp {target} is not after the issue time {issue}')
    if delta % C.STEP_MIN != 0:
        raise UnsupportedHorizonError(f'requested timestamp {target} is not on the {C.STEP_MIN}-minute grid '
                                      f'relative to the issue time {issue}')
    return int(delta // C.STEP_MIN)


def predict(pond_id, history, requested_timestamp, model_path=None, now=None, return_path=False):
    art = load_artifact(model_path)
    if not isinstance(pond_id, str) or not pond_id.strip():
        raise ForecastError('pond_id must be a non-empty string')
    if history is None or len(history) == 0:
        raise InsufficientHistoryError('history is empty')
    try:
        target = pd.Timestamp(requested_timestamp)
    except Exception as e:
        raise ForecastError(f'unparseable requested_timestamp: {requested_timestamp!r}') from e
    if pd.isna(target):
        raise ForecastError('requested_timestamp is missing')
    if target.tzinfo is not None:
        target = target.tz_convert('Asia/Kolkata').tz_localize(None)

    grid = C.make_grid(history)
    if now is not None:
        now = pd.Timestamp(now)
        if now.tzinfo is not None:
            now = now.tz_convert('Asia/Kolkata').tz_localize(None)
        now = now.round('%dmin' % C.STEP_MIN)
        if now > grid.index[-1]:
            ext = pd.date_range(grid.index[-1] + pd.Timedelta(minutes=C.STEP_MIN), now, freq='%dmin' % C.STEP_MIN)
            grid = pd.concat([grid, pd.DataFrame(np.nan, index=ext, columns=C.PARAMS)])
        elif now < grid.index[-1]:
            grid = grid.loc[:now]           # ignore data "from the future"
    if len(grid) < C.MIN_HISTORY_STEPS:
        raise InsufficientHistoryError(f'need at least {C.MIN_HISTORY_STEPS} grid steps (>= 24 h) of history; '
                                       f'got {len(grid)}')
    issue = grid.index[-1]
    k = _steps_between(issue, target)
    max_valid = max(art['max_validated_steps'].values())
    if k > min(C.HARD_MAX_STEPS, max_valid):
        raise UnsupportedHorizonError(
            f'horizon {k * C.STEP_MIN} min exceeds the maximum validated horizon '
            f'({min(C.HARD_MAX_STEPS, max_valid) * C.STEP_MIN} min)')

    warns, results = [], {}
    base = C.base_features(grid.iloc[-C.WINDOW:])
    last_row = base.iloc[-1]
    withheld = {}
    fresh = {}
    for p in C.PARAMS:
        valid_idx = grid.index[grid[p].notna()]
        last_valid = valid_idx[-1] if len(valid_idx) else None
        age_min = (issue - last_valid).total_seconds() / 60 if last_valid is not None else None
        vfrac = float(last_row[f'{p}_vfrac96'])
        fresh[p] = dict(last_valid_timestamp=None if last_valid is None else str(last_valid),
                        age_minutes=age_min, valid_fraction_last_24h=round(vfrac, 3))
        if last_valid is None or age_min > C.MAX_AGE * C.STEP_MIN:
            withheld[p] = f'no valid {C.NAMES[p]} reading in the last {C.MAX_AGE * C.STEP_MIN} min (age: {age_min} min)'
        elif vfrac < MIN_VALID_FRAC_WITHHOLD:
            withheld[p] = f'only {vfrac:.0%} of the last 24 h of {C.NAMES[p]} readings are valid'
        elif vfrac < MIN_VALID_FRAC_WARN:
            warns.append(f'{p}: only {vfrac:.0%} of the last 24 h valid - reduced reliability')
        elif age_min > 0:
            warns.append(f'{p}: latest valid reading is {age_min:.0f} min older than the issue time')
    if len(withheld) == len(C.PARAMS):
        raise InsufficientHistoryError('no parameter has a fresh valid reading: ' + '; '.join(withheld.values()))

    if pond_id not in art['known_ponds']:
        warns.append(f'pond {pond_id!r} was not in the training data - accuracy for unseen ponds is only partly validated '
                     '(see unseen-pond table in the metrics report)')
    months = art['training_info']['months']
    if issue.strftime('%Y-%m') not in months:
        warns.append(f'issue month {issue.strftime("%Y-%m")} is outside the months seen in training ({", ".join(months)}); '
                     'seasonal generalisation is not validated')
    if k > C.BLOCK:
        warns.append(f'horizon {k * C.STEP_MIN} min uses recursive chaining of {int(np.ceil(k / C.BLOCK))} blocks; '
                     'error grows with horizon')

    pred = C.recursive_forecast(grid, art['specs'], k)  # shape (k, 3); steps 1..k
    for j, p in enumerate(C.PARAMS):
        entry = dict(parameter=C.NAMES[p], unit=C.UNITS[p], horizon_minutes=k * C.STEP_MIN, horizon_steps=k,
                     target_timestamp=str(target), issue_timestamp=str(issue), freshness=fresh[p])
        if p in withheld:
            entry.update(status='withheld', value=None, reason=withheld[p])
            warns.append(f'{p}: forecast withheld - {withheld[p]}')
            results[p] = entry
            continue
        if k > art['max_validated_steps'][p]:
            entry.update(status='withheld', value=None,
                         reason=f'horizon exceeds the validated limit for {p} '
                                f'({art["max_validated_steps"][p] * C.STEP_MIN} min)')
            warns.append(f'{p}: forecast withheld - horizon beyond validated limit')
            results[p] = entry
            continue
        v = float(pred[k - 1, j])
        step_in_block = (k - 1) % C.BLOCK + 1
        spec = art['specs'][p][step_in_block]
        b = art['error_bands'][p]
        persistence = float(last_row[f'{p}_base'])
        rng = art['training_ranges'][p]
        status = 'ok'
        if np.isnan(v):
            status = 'withheld'
            entry.update(status=status, value=None, reason='model could not produce a value from the supplied inputs')
            results[p] = entry
            continue
        if not (rng[0] <= persistence <= rng[1]):
            warns.append(f'{p}: current value {persistence:.2f} lies outside the training range {rng[0]:.2f}-{rng[1]:.2f}')
        entry.update(
            status=status, value=round(v, 3),
            method='direct' if k <= C.BLOCK else f'recursive ({int(np.ceil(k / C.BLOCK))} blocks of {C.BLOCK} steps)',
            selected_model=spec['name'],
            fallback_is_persistence=spec['name'] == 'persistence',
            persistence_baseline=round(persistence, 3),
            typical_abs_error=round(float(b['abs_err_q50'][k - 1]), 3),
            abs_error_q90=round(float(b['abs_err_q90'][k - 1]), 3),
            error_estimate_note='from validation-period recursive backtests; indicative only')
        if return_path:
            entry['path'] = [(str(issue + pd.Timedelta(minutes=C.STEP_MIN * (i + 1))), round(float(pred[i, j]), 3))
                             for i in range(k)]
        if p == 'do':
            do_status = classify_do(v)
            if do_status == 'CRITICAL':
                warns.append(f'DO forecast {v:.2f} mg/L is below {LOW_DO_CRIT} mg/L (hypoxia risk)')
            elif do_status == 'WARNING':
                warns.append(f'DO forecast {v:.2f} mg/L is below {LOW_DO_WARN} mg/L (low-oxygen risk)')
        results[p] = entry
    return dict(pond_id=pond_id, issue_timestamp=str(issue), requested_timestamp=str(target),
                horizon_minutes=k * C.STEP_MIN, forecasts=results, warnings=warns,
                model_scope=dict(artifact_version=art['artifact_version'],
                                 max_validated_steps=art['max_validated_steps'],
                                 training_months=months,
                                 note='; '.join(art['limitations'][:2])))


# ------------------------------------------------------------------ unified multi-parameter entry point
SOURCES = ('historical_replay', 'simulated', 'live_hardware')
_PARAM_ALIASES = {'do': 'do', 'dissolved_oxygen': 'do', 'ph': 'ph', 'temp': 'temp', 'temperature': 'temp',
                  'water_temperature': 'temp'}


def validate_current_measurements(current):
    """Return (timestamp, source, {param: float|nan}, problems). Raises ForecastError on structural errors."""
    if not isinstance(current, dict):
        raise ForecastError('current_measurements must be a dict with timestamp, source and measurements')
    for k in ('timestamp', 'source', 'measurements'):
        if k not in current:
            raise ForecastError(f'current_measurements is missing {k!r}')
    if current['source'] not in SOURCES:
        raise ForecastError(f"source must be one of {SOURCES}, got {current['source']!r}")
    try:
        ts = pd.Timestamp(current['timestamp'])
    except Exception as e:
        raise ForecastError(f"unparseable timestamp {current['timestamp']!r}") from e
    if pd.isna(ts):
        raise ForecastError('timestamp is missing')
    if ts.tzinfo is not None:
        ts = ts.tz_convert('Asia/Kolkata').tz_localize(None)
    if not isinstance(current['measurements'], dict) or not current['measurements']:
        raise ForecastError('measurements must be a non-empty dict')
    meas, problems = {p: np.nan for p in C.PARAMS}, []
    for name, val in current['measurements'].items():
        p = _PARAM_ALIASES.get(str(name).lower())
        if p is None:
            raise ForecastError(f'unknown measurement {name!r}; supported: {sorted(set(_PARAM_ALIASES))}')
        if isinstance(val, bool) or val is None:
            problems.append(f'{p}: non-numeric value {val!r} ignored')
            continue
        try:
            v = float(val)
        except (TypeError, ValueError):
            problems.append(f'{p}: non-numeric value {val!r} ignored')
            continue
        lo, hi = C.LIMITS[p]
        if not np.isfinite(v) or v <= 0 or v < lo or v > hi:
            problems.append(f'{p}: value {val!r} outside the physically plausible range {lo}-{hi} {C.UNITS[p]}; '
                            'treated as missing')
            continue
        meas[p] = v
    return ts, current['source'], meas, problems


def predict_all_parameters(model_bundle, pond_id, current_measurements, historical_context, horizons_minutes=None):
    """Forecast DO, pH and temperature at every supported horizon.

    model_bundle        path to aquaguard_model.pkl, or the loaded bundle dict
    pond_id             pond identifier (unseen ponds are allowed but flagged)
    current_measurements {"timestamp": ..., "source": "historical_replay"|"simulated"|"live_hardware",
                          "measurements": {"do": mg/L, "ph": pH, "temp": degC}}   (any subset; names validated)
    historical_context  DataFrame/list of dicts with the pond's recent readings (>= 24 h before `timestamp`;
                        columns as documented in the module docstring). A single reading is NOT enough.
    horizons_minutes    default: the bundle's direct horizons (15, 60, 180) that are within the validated limit
    Returns a dict: provenance, per-horizon forecasts (value/unit/status per parameter), warnings, errors.
    """
    art = load_artifact(model_bundle)
    ts, source, meas, problems = validate_current_measurements(current_measurements)
    if historical_context is None or len(historical_context) == 0:
        raise InsufficientHistoryError('historical_context is required: the model needs >= 24 h of recent readings')
    hist = pd.DataFrame(historical_context).copy()
    tcol = C._pick(hist, 'timestamp')
    if tcol is None:
        raise ForecastError('historical_context needs a timestamp column')
    t = pd.to_datetime(hist[tcol], errors='coerce')
    if getattr(t.dt, 'tz', None) is not None:
        t = t.dt.tz_convert('Asia/Kolkata').dt.tz_localize(None)
    future = (t > ts).sum()
    hist = hist[(t <= ts).to_numpy()].copy()
    hist[tcol] = t[(t <= ts)].to_numpy()
    warns = list(problems)
    if future:
        warns.append(f'{int(future)} historical_context rows after the current timestamp were ignored')
    row = {tcol: ts}
    for p in C.PARAMS:
        row[C._pick(hist, p) or {'do': 'do_clean', 'ph': 'ph_clean', 'temp': 'temp_clean'}[p]] = meas[p]
    hist = pd.concat([hist, pd.DataFrame([row])], ignore_index=True)
    if source == 'simulated':
        warns.append('input is SIMULATED - forecasts do not describe a real pond')
    elif source == 'historical_replay':
        warns.append('input is a HISTORICAL REPLAY, not a live measurement')
    max_valid = art['max_validated_steps']
    if horizons_minutes is None:
        horizons_minutes = [m for m in art['direct_horizons'].values()
                            if m // C.STEP_MIN <= max(max_valid.values())]
    out, errors = {}, {}
    for hm in horizons_minutes:
        try:
            r = predict(pond_id, hist, ts + pd.Timedelta(minutes=hm), model_path=art, now=ts)
            out[str(hm)] = {p: {k: v for k, v in e.items() if k in
                                ('parameter', 'value', 'unit', 'status', 'reason', 'target_timestamp', 'selected_model',
                                 'persistence_baseline', 'typical_abs_error', 'abs_error_q90')}
                            for p, e in r['forecasts'].items()}
            warns.extend(w for w in r['warnings'] if w not in warns)
        except InsufficientHistoryError:
            raise                       # same for every horizon - report it as such
        except ForecastError as e:
            errors[str(hm)] = f'{type(e).__name__}: {e}'
    if not out:
        raise ForecastError('no horizon could be forecast: ' + '; '.join(errors.values()))
    return dict(pond_id=pond_id, issue_timestamp=str(ts), data_source=source,
                pond_known_to_model=pond_id in art['known_ponds'],
                current_measurements={p: (None if np.isnan(v) else v) for p, v in meas.items()},
                forecasts=out, warnings=warns, errors=errors,
                model=dict(artifact_version=art['artifact_version'], max_validated_steps=max_valid,
                           training_months=art['training_info']['months'],
                           bundle_id=art.get('manifest', {}).get('bundle_id')))


if __name__ == '__main__':
    import json
    import sys
    csv = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pond_timeseries_clean.csv')
    d = pd.read_csv(csv, parse_dates=['timestamp'])
    pond = sys.argv[1] if len(sys.argv) > 1 else 'ara2_4f79fc8d'
    h = d[d.pond_id == pond].tail(400)
    ts = pd.Timestamp(h.timestamp.iloc[-1]) + pd.Timedelta(hours=1)
    print(json.dumps(predict(pond, h, ts), indent=2, default=str))
