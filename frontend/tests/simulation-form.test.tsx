import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ health: vi.fn(), demoScenarios: vi.fn(), demoMeasurement: vi.fn(), pondAlerts: vi.fn() }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { SimulationForm } from '@/components/features/SimulationForm';
import { ApiError } from '@/lib/api/client';

const ponds = [{ id: 'p1', name: 'ara2_test', latestAt: '2026-01-30T18:15:00.000Z', latestAgeMinutes: 1000 }];
const rules = { dissolvedOxygen: { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 }, unclassifiedParameters: ['ph', 'temperature'], staleAfterMinutes: 60, note: '' };
const health = (target: 'local' | 'remote' | 'unknown') => ({ status: 'ok', time: '', uptimeSeconds: 1, database: { status: 'up', target }, ml: { status: 'ready' } });
const response = { duplicate: false, measurement: { id: 'm1', pondId: 'p1', recordedAt: '2026-03-01T12:00:00.000Z', receivedAt: '', source: 'simulated', values: [{ parameter: 'dissolved_oxygen', value: 2.5, unit: 'mg/L' }, { parameter: 'ph', value: 7.4, unit: 'pH' }, { parameter: 'temperature', value: 28, unit: 'C' }] },
  risk: { dissolved_oxygen: { value: 2.5, unit: 'mg/L', status: 'WARNING', threshold: 3 }, ph: { value: 7.4, unit: 'pH', status: 'UNKNOWN', note: 'no validated threshold configured for this parameter' }, temperature: { value: 28, unit: 'C', status: 'UNKNOWN', note: 'no validated threshold configured for this parameter' } },
  alerts: [{ parameter: 'dissolved_oxygen', action: 'opened', alertId: 'a'.repeat(24) }], alertStateUpdated: true, inference: { status: 'insufficient_history' }, demo: { simulated: true, scenario: null, note: 'x' } };

beforeEach(() => {
  vi.clearAllMocks();
  api.health.mockResolvedValue(health('local'));
  api.demoScenarios.mockResolvedValue({ scenarios: { healthy: { dissolved_oxygen: 5.2, expected: 'NORMAL' }, warning: { dissolved_oxygen: 2.7, expected: 'WARNING' }, critical: { dissolved_oxygen: 1.8, expected: 'CRITICAL' } }, note: '' });
  api.pondAlerts.mockResolvedValue({ items: [], count: 0, nextCursor: null });
});
const form = async () => { render(<SimulationForm ponds={ponds} rules={rules} />); await screen.findByText('Simulated reading: DO, pH and temperature'); };
const choose = (i: number, v: string) => fireEvent.change(screen.getAllByLabelText('Value')[i]!, { target: { value: v } });
const custom = (label: RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Review and save simulated reading' }));

describe('simulation: one reading, three parameters', () => {
  it('has inputs for DO, pH and temperature with their units, and keeps the guided DO demo separate', async () => {
    await form();
    expect(screen.getByText(/Dissolved oxygen/, { selector: 'label' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Value')).toHaveLength(3);
    expect(screen.getByText('Guided alert demo', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start demo' })).toBeInTheDocument();
    expect(screen.getByText(/It sends dissolved oxygen only/)).toBeInTheDocument();
  });

  it('submits all three custom values in ONE request with the API\'s field names, after confirmation', async () => {
    api.demoMeasurement.mockResolvedValue(response);
    await form();
    choose(0, 'custom'); choose(1, 'custom'); choose(2, 'custom');
    custom(/Custom dissolved oxygen/, '2.5'); custom(/Custom ph/i, '7.4'); custom(/Custom water temperature/, '28');
    expect(screen.getByText('2.5 mg/L')).toBeInTheDocument(); expect(screen.getByText('28 °C')).toBeInTheDocument();     // live preview
    submit();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/2\.5 mg\/L/)).toBeInTheDocument(); expect(within(dialog).getByText(/28 °C/)).toBeInTheDocument();
    expect(api.demoMeasurement).not.toHaveBeenCalled();                                              // nothing sent before confirming
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save simulated reading' }));
    await screen.findByText('Result from the server');
    expect(api.demoMeasurement).toHaveBeenCalledTimes(1);
    expect(api.demoMeasurement.mock.calls[0]![0]).toEqual({ pondId: 'p1', dissolvedOxygen: 2.5, ph: 7.4, temperature: 28 });
    // result: DO classified, pH/temperature explicitly have no rule; alert + forecast text come from the response
    expect(screen.getByText('Opened a new alert')).toBeInTheDocument(); expect(screen.getAllByText('No alert rule')).toHaveLength(2); expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText(/needs at least 24 hours/)).toBeInTheDocument();
    expect(screen.getByText(/Request sent and raw server response/)).toBeInTheDocument();
  });

  it('presets: DO preset is sent as a scenario, pH and temperature presets as numbers', async () => {
    api.demoMeasurement.mockResolvedValue(response);
    await form(); choose(0, 'critical'); choose(1, '8.5'); choose(2, '32'); submit();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save simulated reading' }));
    await screen.findByText('Result from the server');
    expect(api.demoMeasurement.mock.calls[0]![0]).toEqual({ pondId: 'p1', scenario: 'critical', ph: 8.5, temperature: 32 });
  });

  it('parameters that are unchecked are not sent at all', async () => {
    api.demoMeasurement.mockResolvedValue(response);
    await form();
    fireEvent.click(screen.getByLabelText(/^pH/)); fireEvent.click(screen.getByLabelText(/^Water temperature/)); submit();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save simulated reading' }));
    await screen.findByText('Result from the server');
    expect(api.demoMeasurement.mock.calls[0]![0]).toEqual({ pondId: 'p1', scenario: 'warning' });
  });

  it('rejects out-of-range values in the form and sends nothing', async () => {
    await form(); choose(1, 'custom'); custom(/Custom ph/i, '15'); submit();
    expect(await screen.findByText(/pH must be between 0 and 14/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Save this simulated reading/ })).toBeNull();
    custom(/Custom ph/i, '7.4'); choose(2, 'custom'); custom(/Custom water temperature/, '99'); submit();
    expect(await screen.findByText(/Water temperature must be between -5 and 60/)).toBeInTheDocument();
    expect(api.demoMeasurement).not.toHaveBeenCalled();
  });

  it('shows the server\'s validation errors (HTTP 422) when it rejects a request', async () => {
    api.demoMeasurement.mockRejectedValue(new ApiError('http', 'request validation failed', 422, 'VALIDATION_ERROR', [{ path: 'values.1.value', message: 'ph must be between 0 and 14 pH' }]));
    await form(); submit(); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save simulated reading' }));
    expect(await screen.findByText('The simulation was not saved')).toBeInTheDocument();
    expect(screen.getByText(/request validation failed \(VALIDATION_ERROR\)/)).toBeInTheDocument(); expect(screen.getByText(/values\.1\.value: ph must be between 0 and 14/)).toBeInTheDocument();
  });

  it('is disabled unless the API reports a local database (manual form and guided demo)', async () => {
    for (const t of ['remote', 'unknown'] as const) {
      api.health.mockResolvedValue(health(t));
      const { unmount } = render(<SimulationForm ponds={ponds} rules={rules} />);
      await screen.findByText('Simulated reading: DO, pH and temperature');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Review and save simulated reading' })).toBeDisabled());
      expect(screen.getByRole('button', { name: 'Start demo' })).toBeDisabled();
      expect(screen.getByText(/Simulation is disabled/)).toBeInTheDocument();
      unmount();
    }
    expect(api.demoMeasurement).not.toHaveBeenCalled();
  });
});
