import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { ErrorState, Notice } from '@/components/ui/states';
import { PondsDirectory } from '@/components/features/PondsDirectory';

export const metadata: Metadata = { title: 'Ponds' };
export const dynamic = 'force-dynamic';

export default async function PondsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const initialQuery = Array.isArray(q) ? (q[0] ?? '') : (q ?? '');
  let data;
  try { data = await loadFleet(serverApi()); } catch (e) {
    return (<><PageHeader title="Ponds" description="Pick a pond to see how it is doing." /><Card><ErrorState server error={e} title="Could not load ponds" /></Card></>);
  }
  const failed = data.rows.filter((r) => r.risk === 'ERROR').length;
  return (
    <>
      <PageHeader title="Ponds" description="Pick a pond to see how it is doing." />
      <div className="space-y-4">
        {failed ? <Notice tone="warning">Readings for {failed} of {data.rows.length} ponds could not be loaded. Those ponds are shown as unavailable.</Notice> : null}
        {data.truncated ? <Notice tone="warning">The API returned its maximum of 200 ponds, so this list may be incomplete.</Notice> : null}
        <PondsDirectory rows={data.rows} initialQuery={initialQuery} />
      </div>
    </>
  );
}
