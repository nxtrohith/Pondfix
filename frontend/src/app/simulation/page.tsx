import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { loadFleet } from '@/lib/fleet';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SimulationForm } from '@/components/features/SimulationForm';
import { SimulationWorkspace } from '@/components/features/SimulationWorkspace';

export const metadata: Metadata = { title: 'Demo & simulation' };
export const dynamic = 'force-dynamic';

export default async function SimulationPage() {
  const api = serverApi();
  const [fleetR, rulesR] = await Promise.allSettled([loadFleet(api), api.riskRules()]);
  const header = <PageHeader title="Demo & simulation" description="Practice and show how PondFix reacts to a problem, using recorded or made-up readings." />;
  const rules = rulesR.status === 'fulfilled' ? rulesR.value : null;
  // The replay works without the pond list; only the test-reading panel needs it.
  const testReading = fleetR.status === 'rejected'
    ? <Card><ErrorState server error={fleetR.reason} title="Could not load ponds" /></Card>
    : !fleetR.value.rows.length
      ? <Card><EmptyState title="No ponds to simulate">A simulated reading is attached to a pond. Import or register one first.</EmptyState></Card>
      : <SimulationForm ponds={fleetR.value.rows.map((r) => ({ id: r.pond.id, name: r.pond.name, species: r.pond.speciesConfig, latestAt: r.latestAt, latestAgeMinutes: r.latestAgeMinutes, latestSource: r.latestSource }))} rules={rules} />;
  return (<>{header}<SimulationWorkspace testReading={testReading} rules={rules} /></>);
}
