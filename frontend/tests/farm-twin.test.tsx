import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ predictions: vi.fn(), acknowledgeAlert: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { FarmTwin } from '@/components/farm/FarmTwin';
import { demoFarm } from '@/lib/farmDemo';
import { toRow } from '@/lib/fleet';
import type { Alert, Prediction } from '@/lib/api/schemas';

const NOW = Date.parse('2026-03-01T12:00:00Z');
const LOADED = '2026-03-01T12:00:00.000Z';
const demo = () => demoFarm(NOW);
const plan = () => screen.getByRole('group', { name: 'Farm plan, 2D view' });
const pondButtons = () => within(plan()).getAllByRole('button');
const pond = (name: RegExp) => within(plan()).getByRole('button', { name });
const frame = () => screen.getByRole('img', { name: /^Farm plan with/ });

beforeEach(() => { vi.clearAllMocks(); api.predictions.mockResolvedValue({ items: [], generatedAt: null }); });

describe('farm view, 2D plan (what jsdom and no-WebGL browsers get)', () => {
  it('shows exactly 17 individually identifiable ponds, each with its name and status in words', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    expect(pondButtons()).toHaveLength(17);
    expect(new Set(pondButtons().map((b) => b.getAttribute('aria-label'))).size).toBe(17);
    expect(pond(/Demo pond 06, critical/)).toBeInTheDocument(); expect(pond(/Demo pond 04, attention needed/)).toBeInTheDocument(); expect(pond(/Demo pond 01, healthy/)).toBeInTheDocument(); expect(pond(/Demo pond 17, no recent reading/)).toBeInTheDocument();
    expect(screen.getByText(/The 3D view is not available/)).toBeInTheDocument();
  });
  it('counts come from the same pond data as the plan', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    const counts = within(screen.getByRole('list', { name: 'Pond counts' }));
    expect(counts.getByText('Healthy').previousSibling).toHaveTextContent('9'); expect(counts.getByText('Attention needed').previousSibling).toHaveTextContent('3');
    expect(counts.getByText('Critical').previousSibling).toHaveTextContent('2'); expect(counts.getByText('No recent reading').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Needs attention (5)')).toBeInTheDocument();
  });
  it('labels demo fixtures loudly', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    expect(screen.getByText(/made up to show every look of the farm view/)).toBeInTheDocument();
  });

  it('hover shows that pond\'s readings, time and problem; unavailable values are said so; leaving hides it', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.pointerMove(frame(), { clientX: 100, clientY: 100, pointerType: 'mouse' });
    fireEvent.pointerEnter(pond(/Demo pond 11/));
    const tip = screen.getByRole('status');
    expect(tip).toHaveTextContent('Demo pond 11'); expect(tip).toHaveTextContent('Urgent'); expect(tip).toHaveTextContent('9.40'); expect(tip).toHaveTextContent('34.0 °C'); expect(tip).toHaveTextContent('Latest reading');
    expect(tip).toHaveTextContent('pH is critically high'); expect(tip).toHaveTextContent('Water temperature is too high');
    fireEvent.pointerLeave(pond(/Demo pond 11/)); expect(screen.queryByRole('status')).toBeNull();
    fireEvent.pointerMove(frame(), { clientX: 120, clientY: 110, pointerType: 'mouse' }); fireEvent.pointerEnter(pond(/Demo pond 17/)); expect(screen.getByRole('status')).toHaveTextContent('No reading yet'); expect(screen.getByRole('status')).not.toHaveTextContent(/\b0\.0/);
  });
  it('a pond with old readings says they are not recent instead of looking healthy', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.pointerMove(frame(), { clientX: 10, clientY: 10, pointerType: 'mouse' }); fireEvent.pointerEnter(pond(/Demo pond 15/));
    expect(screen.getByRole('status')).toHaveTextContent('Not recent, so the condition is unknown'); expect(screen.getByRole('status')).toHaveTextContent('No recent reading');
  });
  it('touch input shows no hover card (selection is used instead)', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.pointerMove(frame(), { clientX: 10, clientY: 10, pointerType: 'touch' }); fireEvent.pointerEnter(pond(/Demo pond 06/));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clicking selects that pond and shows its readings, current problems and a separate forecast section; no navigation', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    expect(screen.getByText('No pond selected')).toBeInTheDocument();
    fireEvent.click(pond(/Demo pond 11/));
    const panel = screen.getByRole('complementary', { name: 'Selected pond: Demo pond 11' });
    expect(panel).toHaveTextContent('Critical'); expect(within(panel).getByRole('region', { name: 'Current readings' })).toHaveTextContent('9.40');
    expect(within(panel).getByRole('region', { name: 'Current problems' })).toHaveTextContent('pH is critically high');
    expect(within(panel).getByRole('region', { name: 'Forecast' })).toHaveTextContent('Forecast (estimates, not measurements)');
    expect(within(panel).getByRole('region', { name: 'Current readings' })).not.toHaveTextContent('Forecast');
  });
  it('selecting another pond replaces the panel; the close button deselects', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.click(pond(/Demo pond 11/)); fireEvent.click(pond(/Demo pond 04/));
    expect(screen.queryByRole('complementary', { name: 'Selected pond: Demo pond 11' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 04' })).toHaveTextContent('Dissolved oxygen is low');
    fireEvent.click(screen.getByRole('button', { name: 'Close pond details' })); expect(screen.getByText('No pond selected')).toBeInTheDocument();
  });
  it('a pond with no problems says so calmly; one with no data says nothing can be checked', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.click(pond(/Demo pond 01/)); expect(within(screen.getByRole('region', { name: 'Current problems' })).getByText('No current problems.')).toBeInTheDocument();
    fireEvent.click(pond(/Demo pond 17/)); expect(screen.getByRole('region', { name: 'Current problems' })).toHaveTextContent('Nothing can be checked: there is no recent reading.');
    expect(within(screen.getByRole('region', { name: 'Current readings' })).getAllByText('No reading')).toHaveLength(3);
  });
  it('demo ponds never call the API and have no details link', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.click(pond(/Demo pond 06/));
    expect(api.predictions).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: /Open pond details/ })).toBeNull();
    expect(screen.getByText('Forecasts are not available for demo fixtures.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();      // no real alert to update
  });
  it('keyboard: ponds are focusable buttons, Enter and Space select, and the list below works the same', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    const b = pond(/Demo pond 08/); expect(b).toHaveAttribute('tabindex', '0'); fireEvent.keyDown(b, { key: 'Enter' });
    expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 08' })).toBeInTheDocument();
    fireEvent.keyDown(pond(/Demo pond 12/), { key: ' ' }); expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 12' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('list', { name: 'All ponds' })).getByRole('button', { name: /Demo pond 03/ }));
    expect(screen.getByRole('complementary', { name: 'Selected pond: Demo pond 03' })).toBeInTheDocument();
  });
  it('"Needs attention" fades healthy ponds but keeps all 17 on the plan', () => {
    const { rows, alerts } = demo(); render(<FarmTwin rows={rows} alerts={alerts} mode="demo" loadedAt={LOADED} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true'); expect(pondButtons()).toHaveLength(17);
    expect(pond(/Demo pond 01/).getAttribute('opacity')).toBe('0.4'); expect(pond(/Demo pond 06/).getAttribute('opacity')).toBe('1'); expect(pond(/Demo pond 04/).getAttribute('opacity')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'All ponds' })); expect(pond(/Demo pond 01/).getAttribute('opacity')).toBe('1');
  });
});

describe('farm view with real (non-demo) data', () => {
  const real = () => demo().rows.map((r, i) => toRow({ id: `real${i}`, name: `ara2_${String(i).padStart(2, '0')}`, sourceId: `ara2_${String(i).padStart(2, '0')}`, status: 'active' }, { ...r.summary!, pond: { id: `real${i}`, name: `ara2_${i}`, status: 'active' } }));
  const prediction = (parameter: string, minutes: number, value: number): Prediction => ({ id: `${parameter}${minutes}`, pondId: 'real5', parameter, predictedValue: value, unit: 'mg/L', forecastFor: LOADED, generatedAt: LOADED, horizon: { value: minutes, unit: 'minutes' }, dataSource: 'live', risk: value < 3 ? 'WARNING' : 'NORMAL', direction: 'low' });

  it('uses the real pond ids, links to the existing details route and fetches the forecast on selection only (never on hover)', async () => {
    api.predictions.mockResolvedValue({ items: [prediction('dissolved_oxygen', 15, 3.1), prediction('dissolved_oxygen', 60, 2.8), prediction('dissolved_oxygen', 180, 2.4)], generatedAt: LOADED });
    render(<FarmTwin rows={real()} alerts={[]} mode="live" loadedAt={LOADED} />);
    expect(pondButtons()).toHaveLength(17); expect(screen.queryByText(/Demo fixtures/)).toBeNull();
    fireEvent.pointerMove(frame(), { clientX: 5, clientY: 5, pointerType: 'mouse' }); fireEvent.pointerEnter(pond(/ara2_05,/));
    expect(api.predictions).not.toHaveBeenCalled();
    fireEvent.click(pond(/ara2_05,/));
    expect(screen.getByRole('link', { name: /Open pond details/ })).toHaveAttribute('href', '/ponds/real5');
    await waitFor(() => expect(api.predictions).toHaveBeenCalledTimes(1)); expect(api.predictions.mock.calls[0]![0]).toBe('real5');
    const fc = await screen.findByRole('region', { name: 'Dissolved oxygen forecast' });
    expect(within(fc).getByText('IN 1 HOUR')).toBeInTheDocument(); expect(within(fc).getByText(/Dashed boxes are forecasts/)).toBeInTheDocument();
  });
  it('shows the forecast loading failure with a retry, not an invented forecast', async () => {
    api.predictions.mockRejectedValue(new Error('x'));
    render(<FarmTwin rows={real()} alerts={[]} mode="live" loadedAt={LOADED} />);
    fireEvent.click(pond(/ara2_05,/)); expect(await screen.findByText('Could not load the forecast')).toBeInTheDocument();
  });
  it('current problems come from the backend alert list; marking one as seen uses the existing API', async () => {
    const rows = real(); const target = rows[3]!;
    const alert: Alert = { id: 'al1', pondId: target.pond.id, origin: 'observed', parameter: 'dissolved_oxygen', severity: 'WARNING', triggerValue: 2.7, threshold: 3, direction: 'low', message: 'm', status: 'ACTIVE', createdAt: LOADED, lastTriggeredAt: LOADED, dataSource: 'live' };
    api.acknowledgeAlert.mockResolvedValue({ alert: { ...alert, status: 'ACKNOWLEDGED' }, changed: true });
    render(<FarmTwin rows={rows} alerts={[alert]} mode="live" loadedAt={LOADED} />);
    fireEvent.click(pond(/ara2_03,/)); fireEvent.click(await screen.findByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(api.acknowledgeAlert).toHaveBeenCalledWith('al1'));
    expect(await screen.findByText(/Marked as seen: the condition is still active/)).toBeInTheDocument();
  });
  it('a data refresh updates statuses and counts but keeps the selection (and drops it only if the pond is gone)', () => {
    const rows = real(); const { rerender } = render(<FarmTwin rows={rows} alerts={[]} mode="live" loadedAt={LOADED} />);
    fireEvent.click(pond(/ara2_00,/)); expect(screen.getByRole('complementary', { name: 'Selected pond: ara2_00' })).toBeInTheDocument();
    const worse = rows.map((r) => (r.pond.id === 'real0' ? { ...r, risk: 'CRITICAL' as const } : r));
    rerender(<FarmTwin rows={worse} alerts={[]} mode="live" loadedAt="2026-03-01T12:05:00.000Z" />);
    expect(screen.getByRole('complementary', { name: 'Selected pond: ara2_00' })).toHaveTextContent('Urgent'); expect(pond(/ara2_00, critical/)).toBeInTheDocument();
    rerender(<FarmTwin rows={worse.filter((r) => r.pond.id !== 'real0')} alerts={[]} mode="live" loadedAt={LOADED} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
  it('with fewer than 17 ponds, says so, leaves places empty, and offers the clearly labelled demo', () => {
    render(<FarmTwin rows={real().slice(0, 12)} alerts={[]} mode="live" loadedAt={LOADED} />);
    expect(pondButtons()).toHaveLength(12); expect(screen.getByText(/This database has 12 ponds, so 5 places on the plan are empty/)).toBeInTheDocument();
    expect(within(plan()).getAllByText('Unassigned')).toHaveLength(5); expect(screen.getByText(/\?twin=demo/)).toBeInTheDocument();
  });
  it('with more than 17 ponds, says how many are not drawn', () => {
    const extra = [...real(), ...real().slice(0, 3).map((r, i) => ({ ...r, pond: { ...r.pond, id: `x${i}`, name: `zz${i}`, sourceId: `zz${i}` } }))];
    render(<FarmTwin rows={extra} alerts={[]} mode="live" loadedAt={LOADED} />);
    expect(pondButtons()).toHaveLength(17); expect(screen.getByText(/3 more ponds are not drawn/)).toBeInTheDocument();
  });
});
