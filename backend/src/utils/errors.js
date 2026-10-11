export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const badRequest = (m, d) => new ApiError(400, 'BAD_REQUEST', m, d);
export const validationError = (m, d) => new ApiError(422, 'VALIDATION_ERROR', m, d);
export const notFound = (m) => new ApiError(404, 'NOT_FOUND', m);
export const conflict = (m) => new ApiError(409, 'CONFLICT', m);
