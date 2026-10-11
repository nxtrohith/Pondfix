import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { StatusPill, SourceBadge } from '@/components/ui/StatusPill';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api/client';
import { Segmented } from '@/components/ui/Field';
import { PondCard } from '@/components/features/PondCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toRow } from '@/lib/fleet';

describe('ui primitives', () => {
  it('status pills carry their text (colour is never the only signal)', () => {
    render(<><StatusPill tone="critical">Critical</StatusPill><SourceBadge source="simulated" /><SourceBadge source="historical" /></>);
    expect(screen.getByText('Critical')).toBeInTheDocument(); expect(screen.getByText('Simulation')).toBeInTheDocument(); expect(screen.getByText('Historical data')).toBeInTheDocument();
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
  it('segmented control exposes pressed state and reports changes', () => {
    const onChange = vi.fn();
    render(<Segmented label="Parameter" value="a" onChange={onChange} options={[{ value: 'a', label: 'DO' }, { value: 'b', label: 'pH' }]} />);
    expect(screen.getByRole('button', { name: 'DO' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'pH' })); expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('status badge and pond card', () => {
  const pond = { id: 'p1', name: 'ara2_x', status: 'active' };
  it('every status has words and an icon, so colour is never the only signal', () => {
    const { container } = render(<><StatusBadge status="NORMAL" scope="pond" /><StatusBadge status="WARNING" scope="pond" /><StatusBadge status="CRITICAL" scope="pond" /><StatusBadge status="STALE" scope="pond" /><StatusBadge status="NO_DATA" /><StatusBadge status="UNKNOWN" /></>);
    for (const t of ['Healthy', 'Attention needed', 'Critical', 'No recent reading', 'No recent data', 'Not monitored']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(6);
  });
  it('shows n/a for factors without data and never a made-up value; old data is not called healthy', () => {
    const row = toRow(pond, { pond, riskStatus: 'STALE', riskBasis: [], staleAfterMinutes: 60, openAlerts: {}, latestPredictionGeneratedAt: null, parameters: { dissolved_oxygen: { value: 3.45, unit: 'mg/L', recordedAt: '2026-01-30T18:15:00Z', source: 'historical', ageMinutes: 365199, dataState: 'STALE', risk: 'STALE' } } });
    render(<PondCard row={row} />);
    const card = screen.getByRole('link', { name: /ara2_x: No recent reading/ });
    expect(card).toHaveTextContent('3.45'); expect(card).toHaveTextContent('Historical data'); expect(card).toHaveTextContent('Updated 8 months ago'); expect(card).toHaveTextContent('n/a');
    expect(card).not.toHaveTextContent('Healthy'); expect(card).toHaveAttribute('href', '/ponds/p1');
  });
  it('a pond whose summary failed is shown as unavailable, not healthy', () => {
    render(<PondCard row={toRow(pond, null)} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); expect(screen.getByText('No reading yet')).toBeInTheDocument();
  });
  it('names the problem in plain words and separates a forecast warning from a current problem', () => {
    const base = { value: 9.2, unit: 'pH', recordedAt: new Date().toISOString(), source: 'live' as const, ageMinutes: 2, dataState: 'FRESH', risk: 'CRITICAL' as const };
    const row = toRow(pond, { pond, riskStatus: 'CRITICAL', riskBasis: [], staleAfterMinutes: 60, latestPredictionGeneratedAt: null, openAlerts: { CRITICAL: 1 }, parameters: { ph: base },
      openAlertItems: [{ id: 'a1', origin: 'observed', parameter: 'ph', severity: 'CRITICAL', status: 'ACTIVE', direction: 'high' }, { id: 'a2', origin: 'predicted', parameter: 'dissolved_oxygen', severity: 'WARNING', status: 'ACTIVE', direction: 'low' }] });
    render(<PondCard row={row} />);
    expect(screen.getByText('pH is critically high')).toBeInTheDocument();
    expect(screen.getByText(/Forecast warning: a problem may develop soon/)).toBeInTheDocument();
  });
});
