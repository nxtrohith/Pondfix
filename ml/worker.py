"""AquaGuard inference worker: one JSON request per stdin line -> one JSON response per stdout line.

Spawned by the Node backend (never exposed on a network port). The model bundle is a pickle, so it is only loaded
if its SHA-256 equals the pinned value in ml/MODEL_SHA256 (the file produced by our own training run, see
../database/.. docs). Logs go to stderr; stdout carries protocol messages only.

Request:  {"id": str, "op": "ping"|"predict", ...}
  predict: {"pondId": str, "current": {"timestamp","source","measurements":{do,ph,temp}},
            "history": [{"timestamp","do_clean","ph_clean","temp_clean","qc_flyover_window"?}], "horizons": [15,60,180]?}
Response: {"id", "ok": true, "result": {...}} | {"id", "ok": false, "error": {"code", "message"}}
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

MODEL_PATH = os.environ.get('AQUAGUARD_MODEL_PATH') or os.path.join(HERE, '..', 'aquaguard_model.pkl')
MAX_HISTORY_ROWS = 2000


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_model():
    import aquaguard_inference as I
    path = os.path.abspath(MODEL_PATH)
    expected = open(os.path.join(HERE, 'MODEL_SHA256')).read().strip()
    actual = sha256(path)
    if actual != expected:
        raise RuntimeError('model artifact hash does not match ml/MODEL_SHA256; refusing to unpickle')
    return I, I.load_artifact(path)


def clean(o):
    """JSON-safe: NaN/inf -> None, numpy scalars -> python."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if hasattr(o, 'item') and not isinstance(o, (str, bytes)):
        o = o.item()
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


def handle(req, I, bundle):
    op = req.get('op')
    if op == 'ping':
        return {'status': 'ready', 'bundleId': bundle.get('manifest', {}).get('bundle_id'),
                'artifactVersion': bundle.get('artifact_version'), 'horizonsMinutes': sorted(bundle['direct_horizons'].values())}
    if op != 'predict':
        raise I.ForecastError(f'unknown op {op!r}')
    history = req.get('history')
    if not isinstance(history, list) or len(history) > MAX_HISTORY_ROWS:
        raise I.ForecastError(f'history must be a list with at most {MAX_HISTORY_ROWS} rows')
    pond = req.get('pondId')
    out = I.predict_all_parameters(bundle, pond, req.get('current'), history, req.get('horizons'))
    return clean(out)


def main():
    try:
        I, bundle = load_model()
    except Exception as e:  # noqa: BLE001 - report once, then serve errors for every request
        log(f'model load failed: {type(e).__name__}: {e}')
        I, bundle = None, None
        load_err = f'{type(e).__name__}: {e}'
    else:
        load_err = None
        log('model loaded')
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get('id')
            if bundle is None:
                resp = {'id': rid, 'ok': False, 'error': {'code': 'MODEL_UNAVAILABLE', 'message': load_err}}
            else:
                resp = {'id': rid, 'ok': True, 'result': handle(req, I, bundle)}
        except Exception as e:  # noqa: BLE001
            code = 'INSUFFICIENT_HISTORY' if type(e).__name__ == 'InsufficientHistoryError' else \
                   'FORECAST_ERROR' if type(e).__name__ in ('ForecastError', 'UnsupportedHorizonError') else 'INFERENCE_FAILED'
            resp = {'id': rid, 'ok': False, 'error': {'code': code, 'message': f'{type(e).__name__}: {e}'[:500]}}
        print(json.dumps(resp), flush=True)


if __name__ == '__main__':
    main()
