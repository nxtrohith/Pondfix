import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { ApiError, validationError } from '../utils/errors.js';
import { parse } from '../utils/params.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { LANGUAGES, resolveLanguage } from '../services/i18n/languages.js';
import { translateRequest, ttsRequest } from '../validators/i18n.js';

/** deps: { config, i18n: { translation?, speech? }, log }. Both services are absent when Sarvam is not configured. */
export function buildI18nRouter({ config, i18n, log = () => {} }) {
  const r = Router();
  const translateLimit = rateLimit({ max: config.i18n.translateRatePerMin });
  const ttsLimit = rateLimit({ max: config.i18n.ttsRatePerMin });

  r.get('/i18n/languages', (req, res) => res.json({
    configured: Boolean(i18n?.translation),
    items: LANGUAGES.map(({ code, sarvam, translate, tts }) => ({ code, sarvam, translate, tts })),
  }));

  // Translates prose only. Per-item failures come back as status "original" (show the English text); the request itself fails only when the
  // input is invalid, the caller is rate limited, or translation is not configured.
  r.post('/translate', translateLimit, asyncHandler(async (req, res) => {
    const { targetLanguage, items } = parse(translateRequest, req.body);
    const target = resolveLanguage(targetLanguage);
    if (!target || !target.translate) throw validationError('request validation failed', [{ path: 'targetLanguage', message: 'unsupported language' }]);
    if (!i18n?.translation) throw new ApiError(503, 'TRANSLATION_NOT_CONFIGURED', 'translation is not available on this server');
    const results = await i18n.translation.translateBatch(items, target);
    res.json({ targetLanguage: target.code, model: i18n.translation.model, items: results });
  }));

  r.post('/tts', ttsLimit, asyncHandler(async (req, res) => {
    const { text, language } = parse(ttsRequest, req.body);
    const lang = resolveLanguage(language);
    if (!lang) throw validationError('request validation failed', [{ path: 'language', message: 'unsupported language' }]);
    if (!i18n?.speech) throw new ApiError(503, 'TTS_NOT_CONFIGURED', 'speech is not available on this server');
    let out;
    try { out = await i18n.speech.synthesize(text, lang); } catch (e) {
      if (e instanceof ApiError) throw e;
      log(`tts failed lang=${lang.code} kind=${e?.kind || e?.name}`);
      throw new ApiError(502, 'TTS_UNAVAILABLE', 'speech could not be generated right now');
    }
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'X-Audio-Cache': out.cached ? 'hit' : 'miss' }).send(out.audio);
  }));

  return r;
}
