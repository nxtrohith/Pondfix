'use client';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/ssr';
import { Button } from '../ui/Button';
import { useRefresh } from './RefreshContext';

export function RefreshButton() {
  const { refresh, refreshing } = useRefresh();
  return (
    <Button onClick={refresh} disabled={refreshing}>
      <ArrowsClockwise size={16} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
      {refreshing ? 'Refreshing' : 'Refresh'}
    </Button>
  );
}
