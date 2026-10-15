'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANG, makeT, type Lang, type T } from './index';

const Ctx = createContext<Lang>(DEFAULT_LANG);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
/** Translation function for client components. Without a provider (tests, isolated renders) it is English. */
export function useT(): T {
  const lang = useContext(Ctx);
  return useMemo(() => makeT(lang), [lang]);
}
export const useLang = () => useContext(Ctx);
