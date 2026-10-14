import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AdvisorTestLab } from '@/components/features/AdvisorTestLab';

export const metadata: Metadata = { title: 'Tests' };
export const dynamic = 'force-dynamic';

export default async function TestsPage() {
  const fleet = await loadFleet(serverApi()).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  const header = <PageHeader title="Tests" description="Create a critical situation on purpose and watch the alert assistant (Jev and the LLM) react, step by step." />;
  if (!fleet.ok) return (<>{header}<Card><ErrorState server error={fleet.e} title="Could not load ponds" /></Card></>);
  if (!fleet.v.rows.length) return (<>{header}<Card><EmptyState title="No ponds to test with">A test reading is attached to a pond. Import or register one first.</EmptyState></Card></>);
  return (<>{header}<AdvisorTestLab ponds={fleet.v.rows.map((r) => ({ id: r.pond.id, name: r.pond.name }))} /></>);
}
