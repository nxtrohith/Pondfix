import { z } from 'zod';
import { BOUNDS } from '../validators/measurement.js';

// Relaxed, microcontroller-friendly schema for incoming ESP32 sensor telemetry.
// Allows both flat keys (temperature, ph, water_level) and nested Aquafix array format.
export const espSensorDataSchema = z.object({
  deviceId: z.string().trim().min(1).max(64).default('ESP32_DEFAULT'),
  pondId: z.string().trim().optional(),
  // Sensor readings (demo or live hardware)
  temperature: z.number().finite().min(BOUNDS.temperature[0]).max(BOUNDS.temperature[1]).optional(),
  temp: z.number().finite().min(BOUNDS.temperature[0]).max(BOUNDS.temperature[1]).optional(),
  ph: z.number().finite().min(BOUNDS.ph[0]).max(BOUNDS.ph[1]).optional(),
  water_level: z.number().finite().min(BOUNDS.water_level[0]).max(BOUNDS.water_level[1]).optional(),
  waterLevel: z.number().finite().min(BOUNDS.water_level[0]).max(BOUNDS.water_level[1]).optional(),
  dissolved_oxygen: z.number().finite().min(BOUNDS.dissolved_oxygen[0]).max(BOUNDS.dissolved_oxygen[1]).optional(),
  // Standard nested values array if ESP32 already prepares Aquafix format
  values: z.array(z.object({
    parameter: z.enum(['temperature', 'ph', 'water_level', 'dissolved_oxygen']),
    value: z.number().finite(),
    unit: z.string().optional(),
  })).optional(),
  recordedAt: z.string().trim().optional(),
  source: z.enum(['live', 'simulated']).default('live'),
  dryRun: z.boolean().optional(),
}).refine((data) => {
  const hasFlat = data.temperature !== undefined || data.temp !== undefined ||
                  data.ph !== undefined ||
                  data.water_level !== undefined || data.waterLevel !== undefined ||
                  data.dissolved_oxygen !== undefined;
  const hasValues = Array.isArray(data.values) && data.values.length > 0;
  return hasFlat || hasValues;
}, {
  message: 'Payload must contain at least one sensor reading (temperature, ph, water_level, dissolved_oxygen, or values array)',
});
