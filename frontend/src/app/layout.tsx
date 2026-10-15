import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AppShell, type SystemState } from '@/components/shell/AppShell';
import { serverApi } from '@/lib/api/client';
import { getLang } from '@/i18n/server';
import { I18nProvider } from '@/i18n/client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'PondFix', template: '%s | PondFix' }, description: 'Know if your pond is safe, and what to do when it is not.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F6F4EE' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const api = serverApi();
  const lang = await getLang();
  const [health, alerts] = await Promise.allSettled([api.health(), api.alerts({ status: 'OPEN', limit: 200 })]);
  const system: SystemState = health.status === 'fulfilled' ? health.value.status : 'unreachable';
  const openAlerts = alerts.status === 'fulfilled' ? alerts.value.count : null;
  const more = alerts.status === 'fulfilled' && alerts.value.nextCursor !== null;
  return (
    <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <I18nProvider lang={lang}>
          <AppShell system={system} openAlerts={openAlerts} openAlertsMore={more}>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
