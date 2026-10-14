import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SimulationForm } from '@/components/features/SimulationForm';

export const metadata: Metadata = { title: 'Simulation' };
export const dynamic = 'force-dynamic';

export default async function SimulationPage() {
  const api = serverApi();
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="Simulation" description="Submit a clearly marked test reading to see risk classification, alerts and forecasts respond." />;
  if (fleetR.status === 'rejected') return (<>{header}<Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card></>);
  const ponds = fleetR.value.rows.map((r) => ({ id: r.pond.id, name: r.pond.name, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }));
  if (!ponds.length) return (<>{header}<Card><EmptyState title="No ponds to simulate">A simulated reading is attached to a pond. Import or register one first.</EmptyState></Card></>);
  return (<>{header}<SimulationForm ponds={ponds} rules={rulesR.status === 'fulfilled' ? rulesR.value : null} /></>);
}
