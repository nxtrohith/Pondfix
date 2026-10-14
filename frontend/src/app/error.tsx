'use client';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/states';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Card><ErrorState error={error} title="This page could not be displayed" onRetry={reset} /></Card>;
}
