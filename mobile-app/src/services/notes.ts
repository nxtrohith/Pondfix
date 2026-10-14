// Farmer field notes. The backend sorts each note (category, distress) and the alert advisor reads recent ones; a note never creates or
// changes an alert. Everything is validated here; a malformed note is dropped on its own.
import type { FarmerNote } from '@/types';
import { apiGet, apiPost } from './api';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeNote(input: unknown): FarmerNote | null {
  if (!isObj(input)) return null;
  const { id, text, category, createdAt, distress } = input;
  if (typeof id !== 'string' || !id || typeof text !== 'string' || !text || typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null;
  return { id, text, category: typeof category === 'string' ? category : 'unclassified', distress: typeof distress === 'number' && Number.isFinite(distress) ? distress : null, createdAt };
}

export const normalizeNotes = (input: unknown): FarmerNote[] =>
  (isObj(input) && Array.isArray(input.items) ? input.items : []).map(normalizeNote).filter((n): n is FarmerNote => n !== null);

export const getNotes = async (pondId: string) => normalizeNotes(await apiGet(`/ponds/${encodeURIComponent(pondId)}/notes`, { limit: 20 }));
export async function addNote(pondId: string, text: string): Promise<FarmerNote | null> {
  return normalizeNote(await apiPost<unknown>(`/ponds/${encodeURIComponent(pondId)}/notes`, { text }));
}
