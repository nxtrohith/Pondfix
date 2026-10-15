import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import {
  AeratorIllustration, FarmerActionIllustration, FishStatusIllustration, FlowPipeIllustration, ILLUSTRATIONS, PondIllustration, PondStatusMarker,
  WaterLevelSensorIllustration, equipmentFor, fishFor, isUnknownHealth, markerFor, pondFor, pngSrc, svgSrc, type IllustrationId,
} from '@/components/illustrations';
import { ANIMATED_SOURCES } from '@/components/illustrations/animatedSources';
import { AlertCard } from '@/components/features/AlertCard';
import type { Alert } from '@/lib/api/schemas';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const alert = (o: Partial<Alert> = {}): Alert => ({
  id: 'a1', pondId: 'p1', parameter: 'dissolved_oxygen', direction: 'low', severity: 'CRITICAL', status: 'ACTIVE', origin: 'observed', triggerValue: 1.5, threshold: 2,
  createdAt: '2026-03-01T11:00:00.000Z', lastTriggeredAt: '2026-03-01T11:00:00.000Z', ...o,
} as Alert);

describe('asset registry', () => {
  it.each(Object.keys(ILLUSTRATIONS) as IllustrationId[])('%s has a PNG and an isolated SVG on disk', (id) => {
    expect(fs.existsSync(path.join(PUBLIC, pngSrc(id)))).toBe(true);
    expect(fs.existsSync(path.join(PUBLIC, svgSrc(id)))).toBe(true);
  });
  it('PNGs are 600x600 RGBA (transparent)', () => {
    for (const id of Object.keys(ILLUSTRATIONS) as IllustrationId[]) {
      const b = fs.readFileSync(path.join(PUBLIC, pngSrc(id)));
      expect([b.readUInt32BE(16), b.readUInt32BE(20), b[25]]).toEqual([600, 600, 6]);
    }
  });
});

describe('state -> asset adapters', () => {
  it('maps pond status to pond surface and marker', () => {
    expect([pondFor('NORMAL'), pondFor('WARNING'), pondFor('CRITICAL')]).toEqual(['pond_calm', 'pond_mild', 'pond_severe']);
    expect([markerFor('NORMAL'), markerFor('WARNING'), markerFor('CRITICAL')]).toEqual(['marker_normal', 'marker_warning', 'marker_critical']);
  });
  it('unknown conditions never get a marker and never look healthy', () => {
    for (const h of ['STALE', 'NO_DATA', 'UNKNOWN', 'ERROR'] as const) { expect(isUnknownHealth(h)).toBe(true); expect(markerFor(h)).toBeNull(); }
    const { container } = render(<><PondIllustration health="STALE" /><PondStatusMarker health="NO_DATA" /></>);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')!.className).toMatch(/grayscale/);
    expect(screen.getByRole('img')).toHaveAccessibleName('Pond: No recent reading');
  });
  it('maps fish activity classes to the right illustration', () => {
    expect(['normal', 'low', 'distressed', 'motionless'].map((a) => fishFor(a as 'normal'))).toEqual(['fish_normal', 'fish_sluggish', 'fish_gasping', 'fish_motionless']);
  });
  it('maps each monitored parameter to its equipment', () => {
    expect(['dissolved_oxygen', 'ph', 'temperature', 'water_level', 'other'].map(equipmentFor)).toEqual(['do_meter', 'ph_meter', 'temperature_probe', 'water_level_sensor', null]);
  });
});

describe('animated sources (real layers from the asset sheet)', () => {
  it('aerator: five paddles and the splash layer animate', () => {
    const s = ANIMATED_SOURCES.aerator_on;
    expect(s).toContain('data-layer="paddlewheel"'); expect(s).toContain('data-layer="aerator_splash"');
    expect(s.match(/attributeName="height"/g)).toHaveLength(5);
  });
  it('inlet and outlet water move along the stream highlight', () => {
    for (const k of ['inlet_pipe', 'outlet_pipe'] as const) expect(ANIMATED_SOURCES[k]).toContain('attributeName="stroke-dashoffset"');
  });
  it('fish tails move except for the motionless fish', () => {
    for (const k of ['fish_normal', 'fish_sluggish', 'fish_gasping'] as const) expect(ANIMATED_SOURCES[k]).toContain('<animateTransform');
    expect(ANIMATED_SOURCES.fish_motionless).not.toContain('<animate');
  });
  it('concerned farmer animates arms and the sweat drop additively (keeps the original transforms)', () => {
    const s = ANIMATED_SOURCES.farmer_concerned;
    expect(s).toContain('data-layer="farmer_arms"'); expect(s).toContain('data-layer="sweat_drop"'); expect(s.match(/additive="sum"/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it('inline sources carry no duplicate ids that could collide on a page', () => {
    for (const s of Object.values(ANIMATED_SOURCES)) expect(s).not.toMatch(/ id="/);
  });
});

describe('components follow state', () => {
  it('aerator: running animates, stopped and unknown are still', () => {
    const { rerender, container } = render(<AeratorIllustration state="running" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Aerator running');
    rerender(<AeratorIllustration state="stopped" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName('Aerator stopped');
    rerender(<AeratorIllustration state="unknown" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Aerator state unknown');
  });
  it('flow pipe only animates while flowing', () => {
    // jsdom has no matchMedia, so no reduced-motion preference is expressed and motion is allowed
    const { container, rerender } = render(<FlowPipeIllustration kind="inlet" flowing />);
    expect(container.querySelector('svg')).toHaveAttribute('data-animating', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Inlet pipe, water flowing');
    rerender(<FlowPipeIllustration kind="inlet" flowing={false} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-animating', 'false');
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Inlet pipe');
  });
  it('animates when motion is allowed, and a motionless fish never does', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    try {
      const { container } = render(<><FishStatusIllustration activity="normal" /><FishStatusIllustration activity="motionless" /><FarmerActionIllustration pose="concerned" animated /><FarmerActionIllustration pose="concerned" /></>);
      expect([...container.querySelectorAll('svg')].map((s) => s.getAttribute('data-animating'))).toEqual(['true', 'false', 'true', 'false']);
    } finally { vi.unstubAllGlobals(); }
  });
  it('respects prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    try {
      const { container } = render(<AeratorIllustration state="running" />);
      expect(container.querySelector('svg')).toHaveAttribute('data-animating', 'false');
    } finally { vi.unstubAllGlobals(); }
  });
  it('water-level sensor switches to the low-water indicator only when told', () => {
    const { rerender } = render(<WaterLevelSensorIllustration />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Water level equipment');
    rerender(<WaterLevelSensorIllustration low />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Low water level');
  });
});

describe('alert action guide', () => {
  it('shows pictograms beside guidance the app already gives, and the written advice is still there', () => {
    render(<AlertCard alert={alert()} showGuidance />);
    expect(screen.getByTestId('action-guide')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/What to check: Check that aerators are running/)).toBeInTheDocument();
  });
  it('shows no visual when there is no guidance (forecast, resolved, or guidance not requested)', () => {
    const { rerender } = render(<AlertCard alert={alert({ origin: 'predicted' })} showGuidance />);
    expect(screen.queryByTestId('action-guide')).toBeNull();
    rerender(<AlertCard alert={alert({ status: 'RESOLVED' })} showGuidance />);
    expect(screen.queryByTestId('action-guide')).toBeNull();
    rerender(<AlertCard alert={alert()} />);
    expect(screen.queryByTestId('action-guide')).toBeNull();
  });
  it('critical alerts keep their written severity (not colour alone)', () => {
    render(<AlertCard alert={alert()} showGuidance />);
    expect(screen.getByText(/Current problem: critical/)).toBeInTheDocument();
  });
});

import userEvent from '@testing-library/user-event';
import { EquipmentDemoPanel } from '@/components/features/EquipmentDemoPanel';

describe('equipment demo panel', () => {
  it('is labelled as demo data and switches scenarios', async () => {
    render(<EquipmentDemoPanel />);
    expect(screen.getByText('Demo data')).toBeInTheDocument();
    expect(screen.getByText('(48 detected)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Low water' }));
    expect(screen.getByText('Critical: water level is low')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No equipment data' }));
    expect(screen.getByText('State unknown')).toBeInTheDocument();
    expect(screen.getByText('No detection results available.')).toBeInTheDocument();
  });
});
