/**
 * inferenceService.ts — AquaGuard Vision
 * Sends camera frame (JPEG base64) to the local inference service.
 */

import Constants from 'expo-constants';

export interface RawDetection {
  bbox: { x1: number; y1: number; x2: number; y2: number };
  confidence: number;
  label: string;
}

export interface InferenceResult {
  detections: RawDetection[];
  inferenceMs: number;
  /** Pixel size of the image the server actually ran on; detections are in this coordinate space. */
  frameSize?: { width: number; height: number };
  error?: string;
  serverReachable: boolean;
}

const DEFAULT_SERVER_URL = 'http://172.16.20.24:5001';

export function getInferenceUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return (extra['inferenceUrl'] as string) ?? DEFAULT_SERVER_URL;
}

export async function runInference(
  base64Jpeg: string,
  frameWidth: number,
  frameHeight: number
): Promise<InferenceResult> {
  const url = `${getInferenceUrl()}/detect`;
  const t0 = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Jpeg,
        width: frameWidth,
        height: frameHeight,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'no body');
      return {
        detections: [],
        inferenceMs: Date.now() - t0,
        error: `HTTP ${response.status}: ${text}`,
        serverReachable: false,
      };
    }

    const json = (await response.json()) as {
      detections: RawDetection[];
      inference_ms: number;
      frame_size?: { width: number; height: number };
    };

    return {
      detections: json.detections ?? [],
      inferenceMs: json.inference_ms ?? Date.now() - t0,
      frameSize: json.frame_size,
      serverReachable: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      detections: [],
      inferenceMs: Date.now() - t0,
      error: `Network error: ${message}`,
      serverReachable: false,
    };
  }
}
