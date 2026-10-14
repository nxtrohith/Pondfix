import { z } from 'zod';

const MAX_ITEM = 1500; // below Sarvam's 2000-character limit for sarvam-translate:v1
const MAX_TOTAL = 6000;

/** Strict: unknown fields (a model, a mode, an instruction) are rejected, so a client can only choose a language and supply prose. */
export const translateRequest = z.object({
  targetLanguage: z.string().trim().min(2).max(10),
  items: z.array(z.string().min(1).max(MAX_ITEM)).min(1).max(20),
}).strict().superRefine((v, ctx) => {
  if (v.items.reduce((n, s) => n + s.length, 0) > MAX_TOTAL) ctx.addIssue({ code: 'custom', path: ['items'], message: `at most ${MAX_TOTAL} characters in total` });
});

export const ttsRequest = z.object({
  text: z.string().trim().min(1).max(MAX_ITEM),
  language: z.string().trim().min(2).max(10),
}).strict();
