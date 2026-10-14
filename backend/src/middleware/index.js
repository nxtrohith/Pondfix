import { ApiError } from '../utils/errors.js';

// Logs method, path (no query string, no bodies, no headers) and status only.
export const requestLogger = (log = console.log) => (req, res, next) => {
  const t = process.hrtime.bigint();
  res.on('finish', () => log(`${req.method} ${req.path} ${res.statusCode} ${Number(process.hrtime.bigint() - t) / 1e6 | 0}ms`));
  next();
};

export const notFoundHandler = (req, res, next) => next(new ApiError(404, 'NOT_FOUND', `no route for ${req.method} ${req.path}`));

export const errorHandler = ({ production, log = console.error } = {}) => (err, req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body too large' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'malformed JSON body' } });
  log(`unhandled error on ${req.method} ${req.path}: ${err?.name}: ${production ? '' : err?.message}`);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'internal server error' } });
};
