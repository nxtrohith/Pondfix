// Dictionary per language. English is the source and is hand-written (./en); the other languages are generated from it by
// `npm run i18n:translate` (Sarvam, see scripts/translate-locales.mjs), keep the same key structure, and must be reviewed by a
// native speaker before production. A language file may be partial: missing keys fall back to English.
import en from './en';
import te from './te.json';
import hi from './hi.json';
import ta from './ta.json';
import kn from './kn.json';
import ml from './ml.json';
import bn from './bn.json';
import mr from './mr.json';
import gu from './gu.json';
import od from './od.json';
import pa from './pa.json';
import asm from './as.json';
import ur from './ur.json';
import type { LanguageCode } from '../languages';

export const RESOURCES: Record<LanguageCode, object> = { en, te, hi, ta, kn, ml, bn, mr, gu, od, pa, as: asm, ur };
