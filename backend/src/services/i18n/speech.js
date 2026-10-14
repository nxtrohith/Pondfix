// Localized text-to-speech for farmer-facing alerts and instructions. Separate from any calling integration: it only turns text the caller
// already has into MP3 bytes. Audio is cached by exact text, so unchanged messages are never synthesized twice.
import crypto from 'node:crypto';
import { ApiError } from '../../utils/errors.js';

const LARGE_NUMBER = /\b\d{5,}\b/g;

/** Sarvam asks for commas in numbers above four digits (10,000 rather than 10000). */
export const prepareSpeechText = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().replace(LARGE_NUMBER, (n) => Number(n).toLocaleString('en-US'));

export function createSpeechService({ client, log = () => {}, cacheMaxBytes = 16 * 1024 * 1024 } = {}) {
  const cache = new Map(); // key -> Buffer
  const inflight = new Map();
  let bytes = 0;
  const keyFor = (lang, text) => crypto.createHash('sha256').update(`${client.ttsModel}|${lang.sarvam}|${text}`).digest('hex');

  /** @param {{code:string, sarvam:string, tts:boolean}} lang a registry entry */
  async function synthesize(text, lang) {
    if (!lang.tts) throw new ApiError(422, 'TTS_LANGUAGE_UNSUPPORTED', `no voice is available for ${lang.code}`);
    const clean = prepareSpeechText(text);
    if (!clean) throw new ApiError(422, 'VALIDATION_ERROR', 'nothing to speak');
    const key = keyFor(lang, clean);
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return { audio: hit, cached: true }; }
    let p = inflight.get(key);
    if (!p) {
      p = client.speak(clean, lang.sarvam).then((audio) => {
        cache.set(key, audio); bytes += audio.length;
        while (bytes > cacheMaxBytes && cache.size > 1) { const k = cache.keys().next().value; bytes -= cache.get(k).length; cache.delete(k); }
        return audio;
      }).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const audio = await p;
    log(`tts lang=${lang.code} chars=${clean.length} bytes=${audio.length}`);
    return { audio, cached: false };
  }

  return { synthesize, stats: () => ({ entries: cache.size, bytes }) };
}
