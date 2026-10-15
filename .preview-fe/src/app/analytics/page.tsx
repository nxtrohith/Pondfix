import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/states';
import { AnalyticsWorkspace } from '@/components/features/AnalyticsWorkspace';

export const metadata: Metadata = { title: 'Compare ponds' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const api = serverApi();
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="Compare ponds" description="See how ponds differ over a chosen period. For one pond's own trends and forecast, open the pond." />;
  if (fleetR.status === 'rejected') return (<>{header}<Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);
  const ponds = fleetR.value.rows.map((r) => ({ id: r.pond.id, name: r.pond.name, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }));
  const initial = [...ponds].sort((a, b) => Date.parse(b.latestAt ?? '0') - Date.parse(a.latestAt ?? '0'))[0]?.id ?? '';
  return (<>{header}<AnalyticsWorkspace ponds={ponds} initialPondId={initial} rules={rulesR.status === 'fulfilled' ? rulesR.value : null} /></>);
}
