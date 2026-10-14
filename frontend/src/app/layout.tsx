import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AppShell, type SystemState } from '@/components/shell/AppShell';
import { serverApi } from '@/lib/api/client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'PondFix', template: '%s | PondFix' }, description: 'Pond water-quality monitoring, forecasts and alerts.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F8F7F2' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const api = serverApi();
  const [health, alerts] = await Promise.allSettled([api.health(), api.alerts({ status: 'OPEN', limit: 200 })]);
  const system: SystemState = health.status === 'fulfilled' ? health.value.status : 'unreachable';
  const openAlerts = alerts.status === 'fulfilled' ? alerts.value.count : null;
  const more = alerts.status === 'fulfilled' && alerts.value.nextCursor !== null;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppShell system={system} openAlerts={openAlerts} openAlertsMore={more}>{children}</AppShell>
      </body>
    </html>
  );
}
