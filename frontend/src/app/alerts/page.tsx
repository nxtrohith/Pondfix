import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/states';
import { AlertsCenter } from '@/components/features/AlertsCenter';

export const metadata: Metadata = { title: 'Alerts' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ pond?: string }> }) {
  const { pond } = await searchParams;
  const header = <PageHeader title="Alerts" description="What is wrong now, what you have already seen, and what has been resolved." />;
  const result = await serverApi().ponds().then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  if (!result.ok) return (<>{header}<Card><ErrorState server error={result.e} title="Could not load ponds" /></Card></>);
  const items = result.v.items;
  return (<>{header}<AlertsCenter ponds={items.map((p) => ({ id: p.id, name: p.name }))} initialPondId={items.some((p) => p.id === pond) ? pond : ''} /></>);
}
