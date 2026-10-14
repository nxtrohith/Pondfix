// Shows server-written prose in the active language without ever waiting for it: the English original renders immediately, and the
// translation replaces it when it arrives. A response that comes back after the language (or the text) has changed is discarded, so a late
// answer can never overwrite newer content.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { peekTranslation, translateTexts, type Translated } from '@/services/translation';

export interface TranslatedTexts {
  /** The texts to display: translated where a translation is available, the original otherwise. Same order as the input. */
  texts: string[];
  /** The English originals, always available (for a "show original" control and as the fallback). */
  originals: string[];
  /** True while a translation request for the current language is still in flight. */
  pending: boolean;
  /** True when at least one text is currently shown translated. */
  translated: boolean;
}

export function useTranslatedTexts(input: readonly string[], options: { enabled?: boolean } = {}): TranslatedTexts {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const enabled = options.enabled !== false && language !== 'en';
  const signature = `${language}\u0000${input.join('\u0001')}`;
  const originals = useMemo(() => [...input], [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fetched, setFetched] = useState<{ signature: string; results: Translated[] } | null>(null);

  useEffect(() => {
    if (!enabled || originals.every((t) => !t.trim())) return;
    let live = true;
    void translateTexts(language, originals).then((results) => { if (live) setFetched({ signature, results }); });
    return () => { live = false; };
  }, [enabled, language, originals, signature]);

  const current = fetched?.signature === signature ? fetched.results : null;
  const texts = originals.map((o, i) => {
    if (!enabled) return o;
    if (current) return current[i]?.text ?? o;
    return peekTranslation(language, o) ?? o; // an already-cached translation shows on the first frame
  });
  return { texts, originals, pending: enabled && !current && texts.every((t, i) => t === originals[i]), translated: enabled && texts.some((t, i) => t !== originals[i]) };
}

/** One text. */
export function useTranslatedText(text: string, options?: { enabled?: boolean }): { text: string; original: string; pending: boolean; translated: boolean } {
  const r = useTranslatedTexts([text], options);
  return { text: r.texts[0] ?? text, original: text, pending: r.pending, translated: r.translated };
}
