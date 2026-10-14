import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drop } from '@phosphor-icons/react/dist/ssr';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { StatusPill, SourceBadge } from '@/components/ui/StatusPill';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DistributionBar } from '@/components/charts/DistributionBar';
import { ApiError } from '@/lib/api/client';
import { Segmented } from '@/components/ui/Field';
import { PondTable } from '@/components/features/PondTable';
import { toRow } from '@/lib/fleet';

describe('ui primitives', () => {
  it('status pills carry their text (colour is never the only signal)', () => {
    render(<><StatusPill tone="critical">Critical</StatusPill><SourceBadge source="simulated" /><SourceBadge source="historical" /></>);
    expect(screen.getByText('Critical')).toBeInTheDocument(); expect(screen.getByText('Simulated')).toBeInTheDocument(); expect(screen.getByText('Historical replay')).toBeInTheDocument();
  });
  it('KPI card shows label, value and context', () => {
    render(<KpiCard icon={Drop} label="Total ponds" value={17} context="17 with stale or no data" />);
    expect(screen.getByText('Total ponds')).toBeInTheDocument(); expect(screen.getByText('17')).toBeInTheDocument(); expect(screen.getByText(/stale or no data/)).toBeInTheDocument();
  });
  it('empty state explains how to proceed', () => { render(<EmptyState title="No ponds yet">Import one.</EmptyState>); expect(screen.getByText('No ponds yet')).toBeInTheDocument(); expect(screen.getByText('Import one.')).toBeInTheDocument(); });
  it('error state is announced and offers retry only for recoverable errors', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState error={new ApiError('network', 'Could not reach the AquaGuard API.')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the AquaGuard API.');
    fireEvent.click(screen.getByRole('button', { name: /try again/i })); expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ErrorState error={new ApiError('http', 'pond not found', 404, 'NOT_FOUND')} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull(); expect(screen.getByRole('alert')).toHaveTextContent('NOT_FOUND');
  });
  it('distribution lists every category with counts and a text alternative', () => {
    render(<DistributionBar total={4} unitLabel="ponds" segments={[{ key: 'a', label: 'Healthy', count: 1, bar: '#7D9274', text: '' }, { key: 'b', label: 'Stale data', count: 3, bar: '#B9B8AD', text: '' }]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('1 Healthy, 3 Stale data'); expect(screen.getByText('4 ponds in total')).toBeInTheDocument();
  });
  it('segmented control exposes pressed state and reports changes', () => {
    const onChange = vi.fn();
    render(<Segmented label="Parameter" value="a" onChange={onChange} options={[{ value: 'a', label: 'DO' }, { value: 'b', label: 'pH' }]} />);
    expect(screen.getByRole('button', { name: 'DO' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'pH' })); expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('pond table data integrity', () => {
  const pond = { id: 'p1', name: 'ara2_x', status: 'active' };
  it('shows n/a for parameters without data and never a made-up value', () => {
    const row = toRow(pond, { pond, riskStatus: 'STALE', riskBasis: [], staleAfterMinutes: 60, openAlerts: {}, latestPredictionGeneratedAt: null, parameters: { dissolved_oxygen: { value: 3.45, unit: 'mg/L', recordedAt: '2026-01-30T18:15:00Z', source: 'historical', ageMinutes: 365199, dataState: 'STALE', risk: 'STALE' } } });
    render(<PondTable rows={[row]} caption="t" />);
    const cells = screen.getAllByRole('row')[1]!;
    expect(cells).toHaveTextContent('3.45'); expect(cells).toHaveTextContent('Historical replay'); expect(cells).toHaveTextContent('Stale'); expect(cells).toHaveTextContent('8 months ago');
    expect(screen.getAllByTitle('Not available')).toHaveLength(2);
    expect(cells).not.toHaveTextContent('Healthy');
  });
  it('a pond whose summary failed is shown as unavailable, not healthy', () => {
    render(<PondTable rows={[toRow(pond, null)]} caption="t" />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); expect(screen.getByText('No readings')).toBeInTheDocument();
  });
});
