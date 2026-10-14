import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SimulationForm } from '@/components/features/SimulationForm';
import { SimulationWorkspace } from '@/components/features/SimulationWorkspace';

export const metadata: Metadata = { title: 'Simulation' };
export const dynamic = 'force-dynamic';

export default async function SimulationPage() {
  const api = serverApi();
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="Simulation" description="Replay recorded pond history through the risk engine and forecasting model, or submit a clearly marked test reading." />;
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  // The replay works without the pond list; only the test-reading panel needs it.
  const testReading = fleetR.status === 'rejected'
    ? <Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card>
    : !fleetR.value.rows.length
      ? <Card><EmptyState title="No ponds to simulate">A simulated reading is attached to a pond. Import or register one first.</EmptyState></Card>
      : <SimulationForm ponds={fleetR.value.rows.map((r) => ({ id: r.pond.id, name: r.pond.name, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }))} rules={rules} />;
  return (<>{header}<SimulationWorkspace testReading={testReading} rules={rules} /></>);
}
