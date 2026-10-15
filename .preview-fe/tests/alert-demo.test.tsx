import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ health: vi.fn(), demoMeasurement: vi.fn(), pondAlerts: vi.fn() }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { AlertDemoRunner } from '@/components/features/AlertDemoRunner';
import { ApiError } from '@/lib/api/client';

const ponds = [{ id: 'p1', name: 'ara2_test', latestAt: null, latestAgeMinutes: null }];
const health = (target: 'atlas' | 'non-atlas' | 'unknown', demo = true) => ({ status: 'ok', time: '', uptimeSeconds: 1, database: { status: 'up', target }, demo: { enabled: demo }, ml: { status: 'ready' } });
const ingest = (risk: string, action: string, alertId?: string) => ({ duplicate: false, measurement: { id: 'm', pondId: 'p1', recordedAt: '2026-03-01T12:00:00.000Z', receivedAt: '', source: 'simulated', values: [] }, risk: { dissolved_oxygen: { value: 1, unit: 'mg/L', status: risk } }, alerts: [{ parameter: 'dissolved_oxygen', action, ...(alertId ? { alertId } : {}) }], alertStateUpdated: true, inference: { status: 'insufficient_history' } });
const SEQUENCE = [ingest('NORMAL', 'none'), ingest('WARNING', 'opened', 'a'.repeat(24)), ingest('CRITICAL', 'escalated', 'a'.repeat(24)), ingest('NORMAL', 'resolved', 'a'.repeat(24))];
const sentValues = () => api.demoMeasurement.mock.calls.map((c) => c[0].dissolvedOxygen);

beforeEach(() => { vi.clearAllMocks(); api.pondAlerts.mockResolvedValue({ items: [], count: 0, nextCursor: null }); });
const start = async () => { fireEvent.click(await screen.findByRole('button', { name: /start demo|run again/i })); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Run demo' })); };

describe('guided alert demo', () => {
  it('is disabled unless the API is on Atlas with demo mode enabled', async () => {
    for (const [t, demo] of [['atlas', false], ['non-atlas', true], ['unknown', true]] as const) {
      api.health.mockResolvedValue(health(t, demo));
      const { unmount } = render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
      expect(await screen.findByText(/The demo is disabled/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start demo' })).toBeDisabled();
      unmount();
    }
    expect(api.demoMeasurement).not.toHaveBeenCalled();
  });

  it('is disabled when the health check itself fails', async () => {
    api.health.mockRejectedValue(new ApiError('network', 'Could not reach the PondFix API.'));
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    expect(await screen.findByText(/Could not check the API/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start demo' })).toBeDisabled();
  });

  it('sends nothing until the user confirms', async () => {
    api.health.mockResolvedValue(health('atlas'));
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start demo' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(api.demoMeasurement).not.toHaveBeenCalled();
  });

  it('sends 3.5, 2.5, 1.5, 3.5 in order and renders only what the server returned', async () => {
    api.health.mockResolvedValue(health('atlas'));
    SEQUENCE.forEach((r) => api.demoMeasurement.mockResolvedValueOnce(r));
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    await start();
    expect(await screen.findByText(/Sequence complete/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(sentValues()).toEqual([3.5, 2.5, 1.5, 3.5]);
    for (const t of ['No alert change', 'Opened an alert', 'Escalated the open alert', 'Resolved the open alert']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getAllByText('a'.repeat(24)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HTTP 201/)).toHaveLength(4);
    expect(api.pondAlerts).toHaveBeenCalledTimes(4);
  });

  it('pauses on a failed step, never skips it, and retries the SAME step', async () => {
    api.health.mockResolvedValue(health('atlas'));
    api.demoMeasurement
      .mockResolvedValueOnce(SEQUENCE[0]).mockRejectedValueOnce(new ApiError('http', 'service unavailable', 503, 'INTERNAL_ERROR'))
      .mockResolvedValueOnce(SEQUENCE[1]).mockResolvedValueOnce(SEQUENCE[2]).mockResolvedValueOnce(SEQUENCE[3]);
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    await start();
    expect(await screen.findByText(/Paused after a failed step/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/service unavailable \(INTERNAL_ERROR\)/)).toBeInTheDocument();
    expect(screen.getByText('HTTP 503')).toBeInTheDocument();
    expect(sentValues()).toEqual([3.5, 2.5]);                       // step 3 was NOT attempted
    fireEvent.click(screen.getByRole('button', { name: 'Retry step 2' }));
    expect(await screen.findByText(/Sequence complete/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(sentValues()).toEqual([3.5, 2.5, 2.5, 1.5, 3.5]);        // step 2 value re-sent, nothing skipped
  });

  it('cannot start two runs at once (double confirm)', async () => {
    api.health.mockResolvedValue(health('atlas'));
    api.demoMeasurement.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 5)); return SEQUENCE[0]; });
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start demo' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Run demo' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText(/Sequence complete/)).toBeInTheDocument(), { timeout: 5000 });
    expect(api.demoMeasurement).toHaveBeenCalledTimes(4);           // one run, not two
  });

  it('flags a classification that differs from the expected one instead of hiding it', async () => {
    api.health.mockResolvedValue(health('atlas'));
    api.demoMeasurement.mockResolvedValue(ingest('CRITICAL', 'updated', 'b'.repeat(24)));
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={1} />);
    await start();
    await screen.findByText(/Sequence complete/, undefined, { timeout: 5000 });
    expect(screen.getAllByText(/expected Normal/).length).toBeGreaterThan(0);
  });

  it('Stop halts the sequence', async () => {
    api.health.mockResolvedValue(health('atlas'));
    api.demoMeasurement.mockResolvedValue(SEQUENCE[0]);
    render(<AlertDemoRunner ponds={ponds} stepDelayMs={400} />);
    await start();
    await waitFor(() => expect(api.demoMeasurement).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Stop demo' }));
    await new Promise((r) => setTimeout(r, 900));
    expect(api.demoMeasurement).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Stopped/)).toBeInTheDocument();
  });
});
