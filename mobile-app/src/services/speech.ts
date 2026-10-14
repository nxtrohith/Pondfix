// Spoken alerts: text -> MP3 through the backend (Sarvam Bulbul v3), saved on the device so an unchanged message is never synthesized
// twice. The Sarvam key stays on the server; the app only ever talks to its own API. This is independent of any phone-call integration.
//
// Speech is always optional. Every failure is reported as a reason the caller can show; none of them can affect the alert on screen.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { logger } from '@/lib/logger';
import { languageInfo } from '@/i18n/languages';
import { hashText } from './translation';
import { API_BASE_URL, API_CONFIGURED } from './config';

export type SpeechFailure = 'unsupported' | 'offline' | 'not_configured' | 'rate_limited' | 'unavailable';
export class SpeechError extends Error {
  constructor(readonly reason: SpeechFailure) { super(reason); this.name = 'SpeechError'; }
}

const TIMEOUT_MS = 20_000;
const MAX_CHARS = 1500;
const uris = new Map<string, string>(); // key -> playable uri
const inflight = new Map<string, Promise<string>>();

const keyFor = (language: string, text: string) => hashText(`${language}|${text}`);

/** Test hook. */
export function resetSpeechCache() { uris.clear(); inflight.clear(); }

async function download(language: string, text: string, key: string): Promise<string> {
  if (!API_CONFIGURED) throw new SpeechError('not_configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text, language }), signal: controller.signal });
    if (!res.ok) {
      // The text is never logged: only the language and the outcome.
      logger.warn('SPEECH', `speech request for ${language} failed: HTTP ${res.status}`);
      throw new SpeechError(res.status === 422 ? 'unsupported' : res.status === 429 ? 'rate_limited' : res.status === 503 ? 'not_configured' : 'unavailable');
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new SpeechError('unavailable');
    if (Platform.OS === 'web') return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const file = new File(Paths.cache, `speech-${key}.mp3`);
    file.create({ overwrite: true });
    file.write(bytes);
    return file.uri;
  } catch (e) {
    if (e instanceof SpeechError) throw e;
    logger.warn('SPEECH', `speech request for ${language} could not be completed (${controller.signal.aborted ? 'timeout' : 'network'})`);
    throw new SpeechError(controller.signal.aborted ? 'unavailable' : 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a playable uri for `text` spoken in `language`, from the device cache when it was generated before. Throws SpeechError. */
export async function speechUri(text: string, language: string): Promise<string> {
  const clean = text.trim().slice(0, MAX_CHARS);
  if (!clean) throw new SpeechError('unavailable');
  if (!languageInfo(language).voice) throw new SpeechError('unsupported');
  const key = keyFor(language, clean);
  const known = uris.get(key);
  if (known) {
    if (Platform.OS === 'web') return known;
    try { if (new File(known).exists) return known; } catch { /* regenerate below */ }
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = download(language, clean, key).then((uri) => { uris.set(key, uri); return uri; }).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}
