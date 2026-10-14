import { ObjectId } from 'mongodb';
import { espSensorDataSchema } from './schema.js';
import { parse } from '../utils/params.js';
import { ingestMeasurement } from '../services/ingestion.js';
import { classify } from '../services/risk.js';
import { ruleFor } from '../services/speciesProfiles.js';
import { ApiError } from '../utils/errors.js';

/**
 * Normalizes an ESP32 payload into the standard Aquafix measurement ingestion schema.
 */
export function normalizeEspPayload(raw, targetPondId) {
  const values = [];

  // If payload already has Aquafix formatted values array, use it
  if (Array.isArray(raw.values) && raw.values.length > 0) {
    values.push(...raw.values);
  } else {
    // Extract flat sensor properties
    const tempVal = raw.temperature ?? raw.temp;
    if (tempVal !== undefined && tempVal !== null) {
      values.push({ parameter: 'temperature', value: Number(tempVal), unit: 'C' });
    }

    const phVal = raw.ph;
    if (phVal !== undefined && phVal !== null) {
      values.push({ parameter: 'ph', value: Number(phVal), unit: 'pH' });
    }

    const waterVal = raw.water_level ?? raw.waterLevel;
    if (waterVal !== undefined && waterVal !== null) {
      values.push({ parameter: 'water_level', value: Number(waterVal), unit: 'm' });
    }

    const doVal = raw.dissolved_oxygen;
    if (doVal !== undefined && doVal !== null) {
      values.push({ parameter: 'dissolved_oxygen', value: Number(doVal), unit: 'mg/L' });
    }
  }

  const normalized = {
    pondId: String(targetPondId),
    source: raw.source || 'live',
    values,
  };

  if (raw.recordedAt) {
    normalized.recordedAt = raw.recordedAt;
  }

  return normalized;
}

/**
 * Resolves target pond for the device. If pondId is explicitly supplied and valid, verifies it.
 * Otherwise, falls back to the first active pond in the database.
 */
export async function resolvePond(db, requestedPondId) {
  if (requestedPondId && ObjectId.isValid(requestedPondId)) {
    const pond = await db.collection('ponds').findOne({ _id: new ObjectId(requestedPondId) });
    if (pond) return pond;
  }

  // Fallback to active pond
  const activePond = await db.collection('ponds').findOne({ status: 'active' });
  if (activePond) return activePond;

  // Fallback to any pond
  const anyPond = await db.collection('ponds').findOne({});
  if (anyPond) return anyPond;

  throw new ApiError(
    400,
    'NO_POND_AVAILABLE',
    'No ponds found in database. Please create or seed at least one pond before sending sensor data.'
  );
}

/**
 * Ingests sensor reading from ESP32.
 * Supports dry-run mode (via body.dryRun, options.dryRun, or SENSOR_DRY_RUN env var).
 */
export async function handleSensorData(deps, rawBody, options = {}) {
  const parsed = parse(espSensorDataSchema, rawBody);
  const pond = await resolvePond(deps.db, parsed.pondId);
  const normalizedPayload = normalizeEspPayload(parsed, pond._id);

  const isDryRun = Boolean(
    parsed.dryRun ||
    options.dryRun ||
    process.env.SENSOR_DRY_RUN === 'true'
  );

  const logger = deps.log || console.log;

  if (isDryRun) {
    const riskSummary = {};
    const logDetails = [];

    for (const v of normalizedPayload.values) {
      const { rule } = ruleFor(pond, v.parameter);
      const cls = classify(v.parameter, v.value, rule);
      riskSummary[v.parameter] = cls.status;
      logDetails.push(`  -> ${v.parameter}: ${v.value} ${v.unit} [status: ${cls.status}]`);
    }

    logger(`[SENSOR DRY-RUN] Received from device "${parsed.deviceId}" for pond "${pond.name}" (${pond._id}):\n${logDetails.join('\n')}\n[SENSOR DRY-RUN] Database write skipped. No data modified.`);

    const nowIso = (deps.now ? deps.now() : new Date()).toISOString();
    return {
      status: 200,
      body: {
        success: true,
        dryRun: true,
        message: 'Sensor data received and validated in dry-run mode. Database was not modified.',
        deviceId: parsed.deviceId,
        pondId: String(pond._id),
        pondName: pond.name,
        receivedAt: nowIso,
        receivedValues: normalizedPayload.values.reduce((acc, curr) => {
          acc[curr.parameter] = curr.value;
          return acc;
        }, {}),
        riskSummary,
      },
    };
  }

  const ingestionResult = await ingestMeasurement(deps, normalizedPayload);

  // Return simplified, microcontroller-friendly status
  const riskSummary = {};
  if (ingestionResult.body?.risk) {
    for (const [param, info] of Object.entries(ingestionResult.body.risk)) {
      riskSummary[param] = info.status;
    }
  }

  logger(`[SENSOR LIVE] Ingested telemetry from "${parsed.deviceId}" for pond "${pond.name}" -> Measurement ID: ${ingestionResult.body?.measurement?.id}`);

  return {
    status: ingestionResult.status,
    body: {
      success: true,
      dryRun: false,
      deviceId: parsed.deviceId,
      pondId: String(pond._id),
      pondName: pond.name,
      measurementId: ingestionResult.body?.measurement?.id,
      recordedAt: ingestionResult.body?.measurement?.recordedAt,
      receivedAt: ingestionResult.body?.measurement?.receivedAt,
      receivedValues: normalizedPayload.values.reduce((acc, curr) => {
        acc[curr.parameter] = curr.value;
        return acc;
      }, {}),
      riskSummary,
      activeAlertsCount: (ingestionResult.body?.alerts || []).length,
    },
  };
}
