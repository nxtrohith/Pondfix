// Thin client for the two Sarvam endpoints this app uses. Request and response shapes follow the current API reference:
//   POST /translate        https://docs.sarvam.ai/api-reference/text/translate-text
//   POST /text-to-speech   https://docs.sarvam.ai/api-reference/text-to-speech/convert
// Only the documented parameters are sent, and `input` / `text` is the only caller-controlled value: there is no way to pass instructions.
// The API key is read from server configuration, sent in the `api-subscription-key` header, and never logged. Request text is never logged.
export class SarvamError extends Error {
  constructor(kind, message, status = null) { super(message); this.name = 'SarvamError'; this.kind = kind; this.status = status; }
}

const kindForStatus = (s) => (s === 429 ? 'rate_limited' : s === 401 || s === 403 ? 'auth' : s >= 500 ? 'unavailable' : 'bad_request');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSarvamClient({ apiKey, baseUrl = 'https://api.sarvam.ai', translateModel = 'sarvam-translate:v1', ttsModel = 'bulbul:v3', ttsSpeaker = '', timeoutMs = 8000, retries = 1, backoffMs = 300, fetchImpl = fetch, log = () => {} } = {}) {
  const configured = Boolean(apiKey);

  async function post(path, body, op) {
    if (!configured) throw new SarvamError('not_configured', 'Sarvam is not configured');
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return await res.json();
        last = new SarvamError(kindForStatus(res.status), `Sarvam ${op} returned HTTP ${res.status}`, res.status);
      } catch (e) {
        if (e instanceof SarvamError) throw e;
        last = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? new SarvamError('timeout', `Sarvam ${op} timed out`) : new SarvamError('unavailable', `Sarvam ${op} failed: ${e?.name || 'error'}`);
      }
      // Retry only what can succeed on a second try; a bad request or a bad key will not.
      if (!['timeout', 'unavailable', 'rate_limited'].includes(last.kind) || attempt === retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
    log(`sarvam ${op} failed kind=${last.kind} status=${last.status ?? '-'}`);
    throw last;
  }

  return {
    configured,
    translateModel,
    ttsModel,
    /** English source text -> `target` (a Sarvam code such as te-IN). Formal register, international numerals (0-9) so values keep their digits. */
    async translate(text, target) {
      const j = await post('/translate', { input: text, source_language_code: 'en-IN', target_language_code: target, model: translateModel, mode: 'formal', numerals_format: 'international' }, 'translate');
      if (typeof j?.translated_text !== 'string') throw new SarvamError('bad_response', 'Sarvam translate returned no text');
      return j.translated_text;
    },
    /** Text -> MP3 bytes. */
    async speak(text, languageCode) {
      const j = await post('/text-to-speech', { text, language_code: languageCode, model: ttsModel, output_audio_codec: 'mp3', ...(ttsSpeaker ? { speaker: ttsSpeaker } : {}) }, 'tts');
      const b64 = Array.isArray(j?.audios) ? j.audios[0] : null;
      if (typeof b64 !== 'string' || !b64) throw new SarvamError('bad_response', 'Sarvam text-to-speech returned no audio');
      return Buffer.from(b64, 'base64');
    },
  };
}
