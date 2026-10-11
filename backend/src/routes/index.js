import { Router } from 'express';
import { asyncHandler, parseObjectId } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { ingestMeasurement } from '../services/ingestion.js';
import { listMeasurements, latestByParameter, pondSummary, listPredictions, listAlerts, requirePond, serializePond, serializeAlert } from '../services/queries.js';
import { pondAnalytics, comparePonds } from '../services/analytics.js';
import { acknowledge } from '../services/alerts.js';
import { demoMeasurement, SCENARIOS } from '../services/demo.js';
import { THRESHOLDS } from '../services/risk.js';
import { replayPonds, replayCoverage, replayWindow, replayForecast } from '../services/replay.js';

export function buildRouter(deps) {
  const { db, config, now, dbTarget = 'unknown' } = deps;
  const r = Router();

  r.get('/health', asyncHandler(async (req, res) => {
    let database = 'up';
    try { await Promise.race([db.command({ ping: 1 }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]); } catch { database = 'down'; }
    let ml = 'disabled';
    if (config.ml.enabled && deps.ml) { try { await deps.ml.ping(); ml = 'ready'; } catch { ml = 'unavailable'; } }
    const ok = database === 'up';
    res.status(ok ? 200 : 503).json({ status: !ok ? 'down' : ml === 'unavailable' ? 'degraded' : 'ok', time: now(), uptimeSeconds: Math.round(process.uptime()), database: { status: database, target: dbTarget }, ml: { status: ml } });
  }));

  // The backend owns the rules; clients read them here instead of duplicating numbers.
  r.get('/risk-rules', (req, res) => res.json({
    dissolvedOxygen: { unit: THRESHOLDS.dissolved_oxygen.unit, criticalBelow: THRESHOLDS.dissolved_oxygen.low_crit, warningBelow: THRESHOLDS.dissolved_oxygen.low_warn },
    unclassifiedParameters: ['ph', 'temperature', 'water_level'],
    staleAfterMinutes: config.staleAfterMinutes,
    note: 'Project default thresholds, not validated species-specific limits. pH, temperature and water level have no validated rules.',
  }));

  r.get('/ponds', asyncHandler(async (req, res) => {
    const ponds = await db.collection('ponds').find({}).sort({ name: 1 }).limit(200).toArray();
    res.json({ items: ponds.map(serializePond), count: ponds.length });
  }));
  r.get('/ponds/:id', asyncHandler(async (req, res) => res.json(serializePond(await requirePond(db, req.params.id)))));
  r.get('/ponds/:id/summary', asyncHandler(async (req, res) => res.json(await pondSummary(db, config, await requirePond(db, req.params.id), now()))));

  r.get('/ponds/:id/measurements/latest', asyncHandler(async (req, res) => {
    const pond = await requirePond(db, req.params.id);
    const source = ['historical', 'simulated', 'live'].includes(req.query.source) ? req.query.source : undefined;
    const latest = await latestByParameter(db, pond._id, source);
    const t = now();
    const parameters = Object.fromEntries(Object.entries(latest).map(([p, l]) => {
      const ageMinutes = Math.round(((t - l.recordedAt) / 60000) * 10) / 10;
      return [p, { ...l, ageMinutes, stale: ageMinutes > config.staleAfterMinutes }];
    }));
    res.json({ pondId: pond._id, parameters, staleAfterMinutes: config.staleAfterMinutes });
  }));
  r.get('/ponds/:id/measurements', asyncHandler(async (req, res) => res.json(await listMeasurements(db, config, (await requirePond(db, req.params.id))._id, req.query))));

  r.post('/measurements', asyncHandler(async (req, res) => {
    const out = await ingestMeasurement(deps, req.body);
    res.status(out.status).json(out.body);
  }));

  // Historical replay: read-only, never writes (see services/replay.js).
  r.get('/replay/ponds', asyncHandler(async (req, res) => res.json(await replayPonds(db))));
  r.get('/replay/ponds/:id', asyncHandler(async (req, res) => res.json(await replayCoverage(db, req.params.id))));
  r.get('/replay/ponds/:id/window', asyncHandler(async (req, res) => res.json(await replayWindow(db, req.params.id, req.query))));
  r.post('/replay/forecast', asyncHandler(async (req, res) => res.json(await replayForecast(deps, req.body))));

  r.get('/ponds/:id/predictions', asyncHandler(async (req, res) => res.json(await listPredictions(db, config, (await requirePond(db, req.params.id))._id, req.query))));
  r.get('/ponds/:id/alerts', asyncHandler(async (req, res) => res.json(await listAlerts(db, config, req.query, (await requirePond(db, req.params.id))._id))));
  r.get('/ponds/:id/analytics', asyncHandler(async (req, res) => res.json(await pondAnalytics(db, config, await requirePond(db, req.params.id), req.query))));
  r.get('/analytics/compare', asyncHandler(async (req, res) => res.json(await comparePonds(db, config, req.query))));

  r.get('/alerts', asyncHandler(async (req, res) => res.json(await listAlerts(db, config, req.query))));
  r.patch('/alerts/:id/acknowledge', asyncHandler(async (req, res) => {
    const { alert, changed } = await acknowledge(db, parseObjectId(req.params.id, 'alert id'), now());
    res.json({ alert: serializeAlert(alert), changed });
  }));

  if (config.demoEnabled) {
    r.get('/demo/scenarios', (req, res) => res.json({ scenarios: SCENARIOS, note: 'Explicit demo inputs (source "simulated"), not real pond readings.' }));
    r.post('/demo/measurement', asyncHandler(async (req, res) => {
      const out = await demoMeasurement(deps, req.body);
      res.status(out.status).json(out.body);
    }));
  }
  return r;
}
