import { ApiError } from '../utils/errors.js';

/** Fixed-window limiter per client address (in memory: enough for a single API process; use a shared store when scaling out). */
export function rateLimit({ max, windowMs = 60_000, now = () => Date.now(), keyFn = (req) => req.ip || req.socket?.remoteAddress || 'unknown' }) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now(); const k = keyFn(req);
    let h = hits.get(k);
    if (!h || h.reset <= t) { h = { count: 0, reset: t + windowMs }; hits.set(k, h); }
    if (hits.size > 5000) for (const [key, v] of hits) if (v.reset <= t) hits.delete(key);
    if (++h.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((h.reset - t) / 1000))));
      return next(new ApiError(429, 'RATE_LIMITED', 'too many requests; try again shortly'));
    }
    next();
  };
}
