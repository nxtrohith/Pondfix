import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { handleSensorData, resolvePond } from './service.js';

export function buildSensorRoutes(deps) {
  const router = Router();

  /**
   * Primary telemetry ingestion endpoint for ESP32.
   * Expects JSON payload with temperature, ph, water_level (or values array).
   */
  router.post(['/data', '/telemetry'], asyncHandler(async (req, res) => {
    const isDry = req.query.dryRun === 'true' || req.query.dryRun === '1' || req.query.dry === 'true';
    const result = await handleSensorData(deps, req.body, { dryRun: isDry });
    res.status(result.status).json(result.body);
  }));

  /**
   * Quick connection & configuration check for ESP32.
   * Tells the device that the backend is up, current server time, default pond ID, and recommended sample interval.
   */
  router.get(['/info', '/ping'], asyncHandler(async (req, res) => {
    let defaultPond = null;
    try {
      const pond = await resolvePond(deps.db);
      defaultPond = { id: String(pond._id), name: pond.name };
    } catch {
      // Ponds might not be seeded yet
    }

    res.json({
      status: 'online',
      service: 'Aquafix Sensor Ingestion Gateway',
      serverTime: (deps.now ? deps.now() : new Date()).toISOString(),
      defaultPond,
      recommendedIntervalSeconds: 15,
      supportedParameters: ['temperature', 'ph', 'water_level', 'dissolved_oxygen'],
    });
  }));

  return router;
}
