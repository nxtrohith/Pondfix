import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, isLang, makeT, type Lang, type T } from './index';

/** The visitor's chosen language (cookie), or English. Never guessed from the network. */
export async function getLang(): Promise<Lang> {
  try { const v = (await cookies()).get(LANG_COOKIE)?.value; return isLang(v) ? v : DEFAULT_LANG; } catch { return DEFAULT_LANG; }
}
export async function getT(): Promise<T> { return makeT(await getLang()); }
