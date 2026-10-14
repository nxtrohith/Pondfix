'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from './Button';

/** With onRetry: re-runs a client request. Without: refreshes the server-rendered route. */
export function RetryButton({ onRetry, label = 'Try again' }: { onRetry?: () => void; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => (onRetry ? onRetry() : start(() => router.refresh()))}>
      <ArrowsClockwise size={14} className={pending ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
      {pending ? 'Retrying' : label}
    </Button>
  );
}
