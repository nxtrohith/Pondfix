import { Router } from 'express';
import { asyncHandler, parseObjectId } from '../utils/http.js';
import { ApiError, validationError } from '../utils/errors.js';
import { ingestMeasurement } from '../services/ingestion.js';
import { listMeasurements, latestByParameter, pondSummary, listPredictions, listAlerts, requirePond, serializePond, serializeAlert, withPondNames } from '../services/queries.js';
import { pondAnalytics, comparePonds } from '../services/analytics.js';
import { acknowledge } from '../services/alerts.js';
import { demoMeasurement, SCENARIOS } from '../services/demo.js';
import { getActiveRules, PARAMETER_LABEL } from '../services/risk.js';
import { buildSpeciesUpdate, serializeCatalogue } from '../services/speciesProfiles.js';
import { publishAlertChanges } from '../services/alertEvents.js';
import { allSnapshots, publishPondUpdate } from '../services/pondSync.js';
import * as demoPond from '../services/demoPond.js';
import { replayPonds, replayCoverage, replayWindow, replayForecast } from '../services/replay.js';

export function buildRouter(deps) {
  const { db, config, now, events, dbTarget = 'unknown' } = deps;
  const r = Router();

  r.get('/health', asyncHandler(async (req, res) => {
    let database = 'up';
    try { await Promise.race([db.command({ ping: 1 }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]); } catch { database = 'down'; }
    let ml = 'disabled';
    if (config.ml.enabled && deps.ml) { try { await deps.ml.ping(); ml = 'ready'; } catch { ml = 'unavailable'; } }
    const ok = database === 'up';
    res.status(ok ? 200 : 503).json({ status: !ok ? 'down' : ml === 'unavailable' ? 'degraded' : 'ok', time: now(), uptimeSeconds: Math.round(process.uptime()), database: { status: database, target: dbTarget }, demo: { enabled: config.demoEnabled }, ml: { status: ml } });
  }));

  // The backend owns the rules; clients read them here instead of duplicating numbers.
  r.get('/risk-rules', (req, res) => {
    const { rules, mode, version } = getActiveRules();
    const parameters = Object.fromEntries(Object.entries(rules).map(([p, r]) => [p, {
      label: PARAMETER_LABEL[p], unit: r.unit, enabled: r.enabled, source: r.source,
      acceptableRange: { min: r.low_warn ?? null, max: r.high_warn ?? null },
      ...(r.low_warn !== undefined ? { lowWarning: r.low_warn, lowCritical: r.low_crit } : {}),
      ...(r.high_warn !== undefined ? { highWarning: r.high_warn, highCritical: r.high_crit } : {}),
    }]));
    const o = rules.dissolved_oxygen;
    res.json({
      dissolvedOxygen: { unit: o.unit, criticalBelow: o.low_crit, warningBelow: o.low_warn }, // kept for existing clients
      parameters, mode, version,
      unclassifiedParameters: ['water_level', 'ammonia', 'nitrate', 'turbidity'], // measured and shown, but no alert limits are defined
      staleAfterMinutes: config.staleAfterMinutes,
      boundaries: 'A value inside or exactly on the acceptable range is normal. WARNING is strictly beyond a warning limit, CRITICAL strictly beyond a critical limit.',
      note: mode === 'configured' ? 'Limits come from the configured rules file. Validate them for your species before relying on them.'
        : 'Dissolved oxygen is the project default. pH and temperature are PROVISIONAL DEMO limits for software testing, not validated species-specific aquaculture limits.',
    });
  });

  r.get('/ponds', asyncHandler(async (req, res) => {
    const ponds = await db.collection('ponds').find({}).sort({ name: 1 }).limit(200).toArray();
    ponds.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true }));
    res.json({ items: ponds.map(serializePond), count: ponds.length });
  }));
  // One call for the whole fleet: every pond's snapshot (see services/pondSync.js). Registered before /ponds/:id.
  r.get('/ponds/summaries', asyncHandler(async (req, res) => res.json(await allSnapshots(db, config, now()))));
  // Where readings come from: "sensor" (hardware) or "simulator" (the simulator service). One pond, or every active pond at once.
  const dataSourceBody = (body) => {
    const v = body?.dataSource;
    if (v !== 'sensor' && v !== 'simulator') throw validationError('request validation failed', [{ path: 'dataSource', message: 'must be "sensor" or "simulator"' }]);
    return v;
  };
  const setDataSource = async (filter, dataSource) => {
    const at = now();
    try { await db.collection('ponds').updateMany(filter, { $set: { dataSource, dataSourceChangedAt: at, updatedAt: at } }); } catch (e) {
      if (e?.code === 121) throw new ApiError(503, 'SCHEMA_OUTDATED', 'the database does not accept the dataSource field yet; run "npm run db:init -w database" to update the collection validators');
      throw e;
    }
  };
  r.patch('/ponds/data-source', asyncHandler(async (req, res) => {
    const dataSource = dataSourceBody(req.body);
    await setDataSource({ status: 'active' }, dataSource);
    const ponds = await db.collection('ponds').find({ status: 'active' }).toArray();
    for (const p of ponds) await publishPondUpdate({ db, config, events, now }, p._id);
    res.json({ dataSource, updated: ponds.length });
  }));
  r.patch('/ponds/:id/data-source', asyncHandler(async (req, res) => {
    const pond = await requirePond(db, req.params.id);
    await setDataSource({ _id: pond._id }, dataSourceBody(req.body));
    await publishPondUpdate({ db, config, events, now }, pond._id);
    res.json(serializePond(await requirePond(db, req.params.id)));
  }));
  r.get('/ponds/:id', asyncHandler(async (req, res) => res.json(serializePond(await requirePond(db, req.params.id)))));
  // Species catalogue and the status of each safety profile (reference ranges are context, not alert limits).
  r.get('/species-profiles', (req, res) => res.json(serializeCatalogue()));
  // Narrow, validated update: only the species fields (plus updatedAt) of an existing pond can change through this route.
  r.patch('/ponds/:id/species', asyncHandler(async (req, res) => {
    const pond = await requirePond(db, req.params.id);
    const { set, unset } = buildSpeciesUpdate(req.body);
    const at = now();
    const update = { $set: { ...set, updatedAt: at, ...(Object.keys(set).length ? { speciesConfiguredAt: at } : {}) } };
    const unsetFields = Object.keys(unset);
    if (unsetFields.length) update.$unset = unset;
    let saved;
    try { saved = await db.collection('ponds').findOneAndUpdate({ _id: pond._id }, update, { returnDocument: 'after' }); } catch (e) {
      if (e?.code === 121) throw new ApiError(503, 'SCHEMA_OUTDATED', 'the database does not accept species fields yet; run "npm run db:init -w database" to update the collection validators');
      throw e;
    }
    if (!saved) throw new ApiError(404, 'NOT_FOUND', 'pond not found');
    await publishPondUpdate({ db, config, events, now }, saved._id);
    res.json(serializePond(saved));
  }));
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
    if (changed) await publishAlertChanges({ db, events }, [{ action: 'acknowledged', alertId: alert._id }]);
    const [out] = await withPondNames(db, [serializeAlert(alert)]);
    res.json({ alert: out, changed });
  }));

  if (config.demoEnabled) {
    r.get('/demo/scenarios', (req, res) => res.json({ scenarios: SCENARIOS, note: 'Explicit demo inputs (source "simulated"), not real pond readings.' }));
    r.post('/demo/measurement', asyncHandler(async (req, res) => {
      const out = await demoMeasurement(deps, req.body);
      res.status(out.status).json(out.body);
    }));

    // Guided end-to-end demo on the dedicated AquaGuard Demo Pond (services/demoPond.js). No route takes a pond id: the demo pond is the
    // only pond they can touch. Mutating routes also require a dedicated database (name contains "demo" or "test").
    r.get('/demo/pond', asyncHandler(async (req, res) => res.json(await demoPond.status(deps))));
    r.post('/demo/pond/setup', asyncHandler(async (req, res) => res.status(200).json(await demoPond.setup(deps, req.body))));
    r.post('/demo/pond/start', asyncHandler(async (req, res) => res.status(201).json(await demoPond.start(deps, req.body))));
    r.post('/demo/pond/advance', asyncHandler(async (req, res) => res.json(await demoPond.advance(deps, req.body))));
    r.post('/demo/pond/reset', asyncHandler(async (req, res) => res.json(await demoPond.reset(deps, req.body))));
  }
  return r;
}
