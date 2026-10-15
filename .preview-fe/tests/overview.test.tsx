import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fleetStats, toRow } from '@/lib/fleet';
import { summarizeOverview } from '@/lib/overview';
import { WelcomeCard } from '@/components/features/WelcomeCard';
import type { Pond, PondSummary } from '@/lib/api/schemas';

const pond = (id: string): Pond => ({ id, name: id, status: 'active' } as Pond);
const summary = (riskStatus: PondSummary['riskStatus'], openAlertItems: NonNullable<PondSummary['openAlertItems']> = []): PondSummary => ({ riskStatus, parameters: {}, openAlertItems } as unknown as PondSummary);
const alert = (pondId: string, severity: 'WARNING' | 'CRITICAL', dataSource: 'live' | 'simulated' = 'live') => ({ pondId, severity, dataSource });
const critical = { id: 'a', origin: 'observed' as const, parameter: 'dissolved_oxygen', severity: 'CRITICAL' as const, status: 'ACKNOWLEDGED' };

describe('pond status never contradicts its open problems', () => {
  it('an old reading plus an open measured problem is shown by the problem, not as "no recent reading"', () => {
    expect(toRow(pond('p5'), summary('STALE', [critical])).risk).toBe('CRITICAL');
    expect(toRow(pond('p5'), summary('STALE', [{ ...critical, severity: 'WARNING' }])).risk).toBe('WARNING');
  });
  it('forecast-only alerts and healthy ponds are left as reported', () => {
    expect(toRow(pond('p1'), summary('STALE', [{ ...critical, origin: 'predicted' }])).risk).toBe('STALE');
    expect(toRow(pond('p2'), summary('NORMAL')).risk).toBe('NORMAL');
  });
});

describe('Overview headline matches the open alerts (the bell and the Alerts page count the same ones)', () => {
  const stats = (rows: ReturnType<typeof toRow>[]) => fleetStats(rows);
  const quietFleet = Array.from({ length: 16 }, (_, i) => toRow(pond(`q${i}`), summary('STALE')));
  it('one critical problem on a stale pond is the headline, with test data called out', () => {
    const rows = [...quietFleet, toRow(pond('p5'), summary('STALE', [critical]))];
    const s = summarizeOverview(stats(rows), [alert('p5', 'CRITICAL', 'simulated')]);
    expect(s.tone).toBe('critical'); expect(s.headline).toBe('1 pond has a critical problem (test data)'); expect(s.detail).toContain('16 with no recent reading');
  });
  it('never says healthy or "no recent readings" while a problem is open', () => {
    const s = summarizeOverview(stats([toRow(pond('a'), summary('NORMAL')), toRow(pond('b'), summary('NORMAL'))]), [alert('a', 'WARNING')]);
    expect(s.tone).toBe('warning'); expect(s.headline).toBe('1 pond needs attention'); expect(s.headline).not.toMatch(/healthy|no recent/i);
  });
  it('plain cases still read naturally', () => {
    expect(summarizeOverview(stats(quietFleet), []).headline).toBe('No recent readings from any pond');
    expect(summarizeOverview(stats([toRow(pond('a'), summary('NORMAL'))]), []).headline).toBe('Your pond is healthy');
    expect(summarizeOverview(stats([]), []).headline).toBe('No ponds yet');
  });
});

describe('welcome introduction', () => {
  beforeEach(() => { localStorage.clear(); });
  it('shows for a new visitor and stays hidden once dismissed', () => {
    const { unmount } = render(<WelcomeCard />);
    expect(screen.getByText(/New here\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide this introduction' }));
    expect(screen.queryByText(/New here\?/)).toBeNull();
    unmount(); render(<WelcomeCard />);
    expect(screen.queryByText(/New here\?/)).toBeNull();
  });
});
