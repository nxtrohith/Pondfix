import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/states';
import { ForecastWorkspace } from '@/components/features/ForecastWorkspace';

export const metadata: Metadata = { title: 'Forecasts' };
export const dynamic = 'force-dynamic';

export default async function ForecastsPage({ searchParams }: { searchParams: Promise<{ pond?: string }> }) {
  const { pond } = await searchParams;
  const api = serverApi();
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="Forecasts" description="Predicted dissolved oxygen, pH and temperature for the next few hours." />;
  if (fleetR.status === 'rejected') return (<>{header}<Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);
  const ponds = fleetR.value.rows.map((r) => ({ id: r.pond.id, name: r.pond.name, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }));
  const initial = ponds.find((p) => p.id === pond)?.id ?? [...ponds].sort((a, b) => Date.parse(b.latestAt ?? '0') - Date.parse(a.latestAt ?? '0'))[0]?.id ?? '';
  return (<>{header}<ForecastWorkspace ponds={ponds} initialPondId={initial} rules={rulesR.status === 'fulfilled' ? rulesR.value : null} /></>);
}
