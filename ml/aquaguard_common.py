"""
AquaGuard AI - shared forecasting core (used identically by training, evaluation and inference).

Everything that turns raw measurements into model inputs lives here so that
training-time and inference-time features cannot drift apart.

Conventions
-----------
* All series live on a regular 15-minute grid per pond (tz-naive IST).
* Missing / invalid / QC-rejected measurements are NaN. Nothing is ever interpolated;
  the only "fill" is a forward-fill of at most MAX_AGE steps (1 h) to define the last valid value.
* Features at issue time t use only data with timestamp <= t.
* Every model predicts the *change* y(t+k) - last_valid(t) so that persistence is the zero model.
"""
import numpy as np
import pandas as pd

STEP_MIN = 15
PARAMS = ['do', 'ph', 'temp']
UNITS = {'do': 'mg/L', 'ph': 'pH units', 'temp': '°C'}
NAMES = {'do': 'Dissolved Oxygen', 'ph': 'pH', 'temp': 'Water Temperature'}
LIMITS = {'do': (0.0, 20.0), 'ph': (6.0, 10.0), 'temp': (15.0, 35.0)}  # same as preprocess_fwi.py
MAX_AGE = 4            # a measurement older than 4 steps (1 h) is not a usable "current" value
AGE_CAP = 48
DIFF_LAGS = [1, 2, 4, 8, 12, 48, 96]
ROLL_WINS = [4, 12, 96]
SEASON_LAG = 96        # 24 h
BLOCK = 12             # steps predicted directly per block (3 h)
WINDOW = 240           # rows of history that features can ever look at (96 lag + 96 roll + margin)
MIN_HISTORY_STEPS = 97  # >= 24 h of grid span before a forecast is allowed
HARD_MAX_STEPS = 96    # never forecast beyond 24 h

_ALIASES = {
    'timestamp': ['timestamp', 'Date/Time (IST)', 'datetime', 'time'],
    'do': ['do_clean', 'DO (mg/L)', 'do', 'DO'],
    'ph': ['ph_clean', 'pH', 'ph'],
    'temp': ['temp_clean', 'Temperature (°C)', 'temp', 'temperature'],
}


def _pick(df, key):
    for c in _ALIASES[key]:
        if c in df.columns:
            return c
    return None


def make_grid(df, mask_flyover=True):
    """Raw/cleaned records -> regular 15-min grid with columns do, ph, temp (NaN = unusable).

    Applies: timestamp snapping to 15 min (duplicates -> median), zero -> NaN, physical limits -> NaN,
    QC flyover window -> NaN. No interpolation.
    """
    if not isinstance(df, pd.DataFrame):
        df = pd.DataFrame(df)
    tcol = _pick(df, 'timestamp')
    if tcol is None:
        raise ValueError("history needs a timestamp column (one of %s)" % _ALIASES['timestamp'])
    ts = pd.to_datetime(df[tcol], errors='coerce')
    if getattr(ts.dt, 'tz', None) is not None:
        ts = ts.dt.tz_convert('Asia/Kolkata').dt.tz_localize(None)
    cols = {}
    for p in PARAMS:
        c = _pick(df, p)
        cols[p] = pd.to_numeric(df[c], errors='coerce') if c is not None else pd.Series(np.nan, index=df.index)
    d = pd.DataFrame(cols)
    d['ts'] = ts.dt.round('%dmin' % STEP_MIN)
    if mask_flyover and 'qc_flyover_window' in df.columns:
        fly = df['qc_flyover_window'].astype(str).str.lower().isin(['true', '1'])
        d.loc[fly.values, PARAMS] = np.nan
    d = d.dropna(subset=['ts'])
    if d.empty:
        raise ValueError('history has no parseable timestamps')
    for p in PARAMS:
        lo, hi = LIMITS[p]
        bad = (d[p] <= 0) | (d[p] < lo) | (d[p] > hi)
        d.loc[bad, p] = np.nan
    d = d.groupby('ts')[PARAMS].median()
    full = pd.date_range(d.index.min(), d.index.max(), freq='%dmin' % STEP_MIN)
    return d.reindex(full).astype(float)


def base_features(g):
    """Issue-time features (independent of the forecast step). Strictly causal."""
    n = len(g)
    idx = np.arange(n, dtype=float)
    out = {}
    for p in PARAMS:
        x = g[p]
        last = pd.Series(np.where(x.notna().to_numpy(), idx, np.nan), index=g.index).ffill()
        age = (idx - last).to_numpy()
        xf = x.ffill(limit=MAX_AGE)
        out[f'{p}_base'] = xf
        out[f'{p}_age'] = np.where(np.isnan(age), AGE_CAP, np.minimum(age, AGE_CAP))
        for L in DIFF_LAGS:
            out[f'{p}_d{L}'] = xf - xf.shift(L)
        for w in ROLL_WINS:
            r = x.rolling(w, min_periods=max(2, w // 4))
            out[f'{p}_mean{w}'] = r.mean()
            out[f'{p}_std{w}'] = r.std()
            out[f'{p}_min{w}'] = r.min()
            out[f'{p}_max{w}'] = r.max()
        out[f'{p}_vfrac96'] = x.notna().astype(float).rolling(96, min_periods=1).mean()
        out[f'{p}_y0'] = xf.shift(SEASON_LAG)
    return pd.DataFrame(out, index=g.index)


def k_features(g, base, k):
    """Features that depend on forecast step k (1..96): yesterday's value at the target time and the
    time-of-day encodings of issue and target time (cyclical; no calendar date)."""
    out = {}
    for p in PARAMS:
        yk = base[f'{p}_base'].shift(SEASON_LAG - k)
        out[f'{p}_yk'] = yk
        out[f'{p}_yd'] = yk - base[f'{p}_y0']
    h = g.index.hour.to_numpy() + g.index.minute.to_numpy() / 60.0
    ht = h + k * STEP_MIN / 60.0
    out['tod_sin'] = np.sin(2 * np.pi * h / 24)
    out['tod_cos'] = np.cos(2 * np.pi * h / 24)
    out['tgt_sin'] = np.sin(2 * np.pi * ht / 24)
    out['tgt_cos'] = np.cos(2 * np.pi * ht / 24)
    return pd.DataFrame(out, index=g.index)


def build_features(g, k, base=None):
    if base is None:
        base = base_features(g)
    return pd.concat([base, k_features(g, base, k)], axis=1)


def feature_columns():
    rng = pd.date_range('2026-01-01', periods=300, freq='15min')
    g = pd.DataFrame({'do': 5.0, 'ph': 8.0, 'temp': 26.0}, index=rng)
    return list(build_features(g, 1).columns)


FEATURE_COLS = feature_columns()


def clip_pred(p, v):
    lo, hi = LIMITS[p]
    return np.clip(v, 0.0 if p == 'do' else lo, hi)


def predict_spec(spec, F, p):
    """Apply a selected model spec to a feature frame -> absolute predictions (Series)."""
    base = F[f'{p}_base']
    t = spec['type']
    if t == 'persistence':
        pred = base
    elif t == 'seasonal_naive':
        pred = F[f'{p}_yk'].fillna(base)
    elif t == 'seasonal_drift':
        pred = base + F[f'{p}_yd'].fillna(0.0)
    else:
        pred = base + spec['estimator'].predict(F[FEATURE_COLS])
    return pd.Series(clip_pred(p, np.asarray(pred, dtype=float)), index=F.index)


def forecast_block(window, specs):
    """Predict steps 1..BLOCK for all params from the last row of `window` (regular grid)."""
    base = base_features(window)
    res = np.full((BLOCK, len(PARAMS)), np.nan)
    for k in range(1, BLOCK + 1):
        F = build_features(window, k, base).iloc[[-1]]
        for j, p in enumerate(PARAMS):
            res[k - 1, j] = predict_spec(specs[p][k], F, p).iloc[0]
    return res


def recursive_forecast(grid, specs, nsteps):
    """Forecast nsteps (<=96) steps ahead of grid's last row. Blocks of BLOCK direct steps are chained:
    each block's predictions are appended to the history as pseudo-observations and used to
    build the features of the next block (error accumulation is measured in training)."""
    g = grid.iloc[-WINDOW:].copy()
    outs = []
    done = 0
    while done < nsteps:
        blk = forecast_block(g, specs)
        outs.append(blk)
        new_idx = pd.date_range(g.index[-1] + pd.Timedelta(minutes=STEP_MIN), periods=BLOCK,
                                freq='%dmin' % STEP_MIN)
        g = pd.concat([g, pd.DataFrame(blk, index=new_idx, columns=PARAMS)]).iloc[-WINDOW:]
        done += BLOCK
    return np.vstack(outs)[:nsteps]
