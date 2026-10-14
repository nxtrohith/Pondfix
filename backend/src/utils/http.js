import { ObjectId } from 'mongodb';
import { badRequest } from './errors.js';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parseObjectId(value, name = 'id') {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) throw badRequest(`${name} must be a 24-character hex ObjectId`);
  return new ObjectId(value);
}

/** Opaque keyset cursor over (time, _id) so pagination is stable while data is appended. */
export const encodeCursor = (date, id) => Buffer.from(`${date.toISOString()}|${id}`).toString('base64url');
export function decodeCursor(cursor) {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    const date = new Date(iso);
    if (Number.isNaN(+date) || !/^[0-9a-f]{24}$/.test(id)) throw new Error();
    return { date, id: new ObjectId(id) };
  } catch { throw badRequest('invalid cursor'); }
}
