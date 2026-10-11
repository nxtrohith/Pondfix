"""
AquaGuard AI - single source of truth for risk thresholds.

Dissolved oxygen (mg/L), applied identically to CURRENT readings and to FORECAST values:
    value <  DO_CRITICAL (2.0)            -> CRITICAL
    DO_CRITICAL <= value < DO_WARNING (3.0) -> WARNING
    value >= DO_WARNING                   -> NORMAL
Comparisons are strict ("<"): exactly 3.0 is NORMAL, exactly 2.0 is WARNING. CRITICAL is always tested first, so it
takes precedence over WARNING.

!! These are project defaults, NOT validated safety limits. Tolerance to low DO depends on species, size, temperature,
   salinity and pond conditions. Validate them against your target species and farm conditions before relying on them,
   and change them HERE (or via an override file, below) - never by editing a hardcoded number elsewhere.

pH and temperature have no project thresholds and none are invented: they stay UNKNOWN until configured.

Override without editing code: set env AQUAGUARD_THRESHOLDS to a JSON file, e.g.
    {"do": {"low_warn": 4.0, "low_crit": 2.5}, "ph": {"low_warn": 6.5, "low_crit": 6.0, "high_warn": 9.0, "high_crit": 9.5}}
"""
import json
import os

DO_WARNING = 3.0     # mg/L
DO_CRITICAL = 2.0    # mg/L

_DEFAULTS = {
    'do': {'low_warn': DO_WARNING, 'low_crit': DO_CRITICAL},
    'ph': {},
    'temp': {},
}


def validate(th):
    """Raise ValueError for inconsistent thresholds (critical must be stricter than warning)."""
    for p, d in th.items():
        for k, v in d.items():
            if k not in ('low_warn', 'low_crit', 'high_warn', 'high_crit'):
                raise ValueError(f'{p}: unknown threshold key {k!r}')
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
                raise ValueError(f'{p}.{k} must be a finite number, got {v!r}')
        if 'low_warn' in d and 'low_crit' in d and not d['low_crit'] < d['low_warn']:
            raise ValueError(f'{p}: low_crit ({d["low_crit"]}) must be < low_warn ({d["low_warn"]})')
        if 'high_warn' in d and 'high_crit' in d and not d['high_crit'] > d['high_warn']:
            raise ValueError(f'{p}: high_crit ({d["high_crit"]}) must be > high_warn ({d["high_warn"]})')
    return th


def get_thresholds(overrides=None):
    """Defaults, then the AQUAGUARD_THRESHOLDS file, then `overrides` (per-parameter dicts replace the default)."""
    th = {p: dict(d) for p, d in _DEFAULTS.items()}
    path = os.environ.get('AQUAGUARD_THRESHOLDS')
    if path:
        try:
            with open(path) as f:
                loaded = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            raise ValueError(f'AQUAGUARD_THRESHOLDS={path!r} cannot be read as a JSON file: {e}') from e
        if not isinstance(loaded, dict) or not all(isinstance(v, dict) for v in loaded.values()):
            raise ValueError(f'AQUAGUARD_THRESHOLDS={path!r} must contain {{parameter: {{threshold: value}}}}')
        th.update(loaded)
    th.update(overrides or {})
    unknown = set(th) - set(_DEFAULTS)
    if unknown:
        raise ValueError(f'unknown parameter(s) in thresholds: {sorted(unknown)}')
    return validate(th)


def classify_value(value, th):
    """-> (status, violated_key|None, threshold|None). CRITICAL is evaluated before WARNING."""
    if value is None or value != value or not th:
        return 'UNKNOWN', None, None
    for status, key, low in (('CRITICAL', 'low_crit', True), ('CRITICAL', 'high_crit', False),
                             ('WARNING', 'low_warn', True), ('WARNING', 'high_warn', False)):
        if key in th and (value < th[key] if low else value > th[key]):
            return status, key, th[key]
    return 'NORMAL', None, None


def classify_do(value, thresholds=None):
    """DO status string for one value (current or forecast)."""
    return classify_value(value, (thresholds or get_thresholds())['do'])[0]
