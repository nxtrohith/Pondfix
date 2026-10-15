// Ask-the-assistant chat for one pond. The backend keeps the conversation; the app only sends the question and the conversation id.
import { apiPost } from './api';

export interface ChatReply { answer: string; conversationId: string }

export async function askPond(pondId: string, message: string, conversationId?: string): Promise<ChatReply> {
  const r = await apiPost<{ answer?: unknown; conversationId?: unknown }>(`/ponds/${encodeURIComponent(pondId)}/chat`, { message, ...(conversationId ? { conversationId } : {}) });
  if (typeof r?.answer !== 'string' || typeof r?.conversationId !== 'string') throw new Error('unreadable chat reply');
  return { answer: r.answer, conversationId: r.conversationId };
}
