// DEMO DATA. Local notification items for the Notification Center. Nothing here is delivered by push, SMS or any backend.
import type { NotificationItem } from '@/types';

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  { id: 'note-1', category: 'Alert', title: 'Critical low dissolved oxygen', message: 'Pond 1 read 1.8 mg/L, below the critical level.', pondId: 'pond-1', alertId: 'alert-1', createdAt: '2026-10-12T10:10:00.000Z', read: false },
  { id: 'note-2', category: 'Alert', title: 'pH below the acceptable range', message: 'Pond 2 pH read 6.3.', pondId: 'pond-2', alertId: 'alert-2', createdAt: '2026-10-12T08:30:00.000Z', read: false },
  { id: 'note-3', category: 'Sensor', title: 'Temperature sensor offline', message: 'Pond 2 has not reported temperature since 08:20 UTC.', pondId: 'pond-2', alertId: null, createdAt: '2026-10-12T08:20:00.000Z', read: false },
  { id: 'note-4', category: 'Alert', title: 'High water temperature', message: 'Pond 3 read 32.1 °C, above the warning level.', pondId: 'pond-3', alertId: 'alert-3', createdAt: '2026-10-12T10:12:00.000Z', read: false },
  { id: 'note-5', category: 'Forecast', title: 'Illustrative forecast', message: 'Demo forecast: Pond 1 oxygen may stay at a critical level.', pondId: 'pond-1', alertId: null, createdAt: '2026-10-12T10:20:00.000Z', read: true },
  { id: 'note-6', category: 'System', title: 'Demo data in use', message: 'This app shows illustrative data. No real sensors are connected.', pondId: null, alertId: null, createdAt: '2026-10-12T09:00:00.000Z', read: true },
];
