// The app's single realtime connection (Socket.IO). Alerts and pond/reading updates share it, however many screens or stores listen.
// Events are NOT replayed by the server: after every (re)connect `onSync` fires so the owner refetches authoritative state.
import { io, type Socket } from 'socket.io-client';
import type { AlertItem } from '@/types';
import { normalizeAlert } from './alerts';
import { normalizePondEvent, type PondEvent } from './ponds';
import { logger } from '@/lib/logger';
import { API_CONFIGURED, API_ORIGIN } from './config';

/** Consecutive failed connection attempts after which the status stops saying "reconnecting". Retries continue in the background. */
export const GIVE_UP_AFTER_ATTEMPTS = 3;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type AlertEventName = 'alert:new' | 'alert:updated' | 'alert:resolved';

export interface RealtimeSubscription {
  onAlert?(alert: AlertItem, event: AlertEventName): void;
  onPond?(event: PondEvent): void;
  onStatus(status: ConnectionStatus): void;
  onSync(): void;
}

let socket: Socket | null = null;
const subscribers = new Set<RealtimeSubscription>();
const ALERT_EVENTS: AlertEventName[] = ['alert:new', 'alert:updated', 'alert:resolved'];
const POND_EVENTS = ['pond:reading_updated', 'pond:updated', 'pond:forecast_updated'] as const;
const emitStatus = (s: ConnectionStatus) => subscribers.forEach((sub) => sub.onStatus(s));
let failedAttempts = 0;

function ensureSocket(): Socket | null {
  if (!API_CONFIGURED) return null;
  if (socket) return socket;
  // The endpoint is the backend origin (never Metro, never an Expo tunnel) on the default path /socket.io, the same server as the REST API.
  // WebSocket first, long-polling as a fallback for networks that block the upgrade.
  logger.info('SOCKET', `connecting to ${API_ORIGIN}`);
  const s = io(API_ORIGIN, { transports: ['websocket', 'polling'], autoConnect: false, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 10_000, timeout: 8000 });
  s.on('connect', () => { failedAttempts = 0; logger.info('SOCKET', `connected to ${API_ORIGIN} via ${s.io.engine?.transport?.name ?? '?'}`); emitStatus('connected'); subscribers.forEach((sub) => sub.onSync()); });
  s.on('disconnect', (reason) => {
    logger.warn('SOCKET', `disconnected: ${reason}`);
    emitStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
  });
  s.on('connect_error', (err) => {
    failedAttempts += 1;
    logger.error('SOCKET', `connect_error #${failedAttempts} to ${API_ORIGIN}: ${err.message}`);
    // A few attempts are "reconnecting"; after that say plainly that live updates are unavailable (retries continue quietly).
    emitStatus(failedAttempts >= GIVE_UP_AFTER_ATTEMPTS ? 'disconnected' : 'reconnecting');
  });
  s.io.on('reconnect_attempt', (n: number) => { logger.info('SOCKET', `reconnect attempt ${n}`); if (failedAttempts < GIVE_UP_AFTER_ATTEMPTS) emitStatus('reconnecting'); });
  for (const event of ALERT_EVENTS) {
    s.on(event, (payload: unknown) => {
      const alert = normalizeAlert(payload);
      if (!alert) { logger.warn('ALERT', `ignored malformed ${event} payload`); return; }
      logger.info('ALERT', `${event} received: ${alert.id} pond=${alert.pondId} ${alert.parameter} ${alert.severity} ${alert.status}`);
      subscribers.forEach((sub) => sub.onAlert?.(alert, event));
    });
  }
  for (const event of POND_EVENTS) {
    s.on(event, (payload: unknown) => {
      const parsed = normalizePondEvent(event, payload);
      if (!parsed) { logger.warn('POND', `ignored malformed ${event} payload`); return; }
      logger.info('POND', `${event} received: pond=${parsed.pondId}${parsed.type === 'reading' ? ` measurement=${parsed.measurement.id} latest=[${parsed.latestParameters.join(',')}]` : ''}`);
      subscribers.forEach((sub) => sub.onPond?.(parsed));
    });
  }
  socket = s;
  return s;
}

/** Opens (or reuses) the single connection. Returns an unsubscribe function; the socket closes when the last subscriber leaves. */
export function subscribeToRealtime(sub: RealtimeSubscription): () => void {
  subscribers.add(sub);
  const s = ensureSocket();
  if (!s) sub.onStatus('disconnected');
  else if (!s.connected) { sub.onStatus(s.active ? 'reconnecting' : 'connecting'); s.connect(); } else sub.onStatus('connected');
  return () => {
    subscribers.delete(sub);
    if (subscribers.size === 0 && socket) { failedAttempts = 0; socket.removeAllListeners(); socket.io.removeAllListeners(); socket.disconnect(); socket = null; }
  };
}

/** App returned to the foreground: reconnect if the socket was closed or dropped. */
export function resumeRealtime(): void { if (socket && !socket.connected) { logger.info('SOCKET', 'resuming after foreground'); failedAttempts = 0; emitStatus('reconnecting'); socket.connect(); } }
/** App went to the background: close cleanly instead of keeping a half-dead connection. */
export function pauseRealtime(): void { if (socket?.connected || socket?.active) { logger.info('SOCKET', 'closing for background'); socket.disconnect(); } }
