import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Ask PondFix' };
export const dynamic = 'force-dynamic';

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ pond?: string | string[]; c?: string | string[] }> }) {
  const sp = await searchParams;
  const api = serverApi();
  const [ponds, health] = await Promise.allSettled([api.ponds(), api.health()]);
  const header = <PageHeader title="Ask PondFix" description="Ask questions about a pond and get answers grounded in its readings and the aquaculture library." />;
  if (ponds.status === 'rejected') return (<>{header}<Card><ErrorState server error={ponds.reason} title="Could not load ponds" /></Card></>);
  if (health.status === 'fulfilled' && health.value.ai && !health.value.ai.chatbot) {
    return (<>{header}<Card><EmptyState title="The chat assistant is switched off">Set CHROMA_ENABLED=true and CHATBOT_ENABLED=true in backend/.env (see docs/CHROMA_SETUP.md), then restart the backend.</EmptyState></Card></>);
  }
  if (ponds.value.items.length === 0) return (<>{header}<Card><EmptyState title="No ponds yet">Add a pond first, then come back to ask about it.</EmptyState></Card></>);
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col">
      {header}
      <ChatWorkspace ponds={ponds.value.items} pondId={first(sp.pond)} conversationId={first(sp.c) || null} />
    </div>
  );
}
