// Central diagnostic logger.
//  - Development: every entry goes to the Metro terminal as `HH:MM:SS.mmm [TAG] message` (console.log/warn/error).
//  - Always: the last MAX_ENTRIES entries are kept in memory and shown on the in-app Diagnostics screen, so problems stay visible even when
//    the terminal does not receive device logs (Expo forwards console output to the terminal only in development mode, over a websocket).
//  - Production: nothing is written to the console except errors; the in-memory buffer still works.
// Tags: CONFIG (server address), APP (lifecycle), REST (requests), SOCKET (realtime connection), SYNC (data synchronisation),
// POND (reading/pond events), ALERT (alert events), UI (what a screen renders). Messages never contain secrets or response bodies.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogTag = 'CONFIG' | 'APP' | 'REST' | 'SOCKET' | 'SYNC' | 'POND' | 'ALERT' | 'UI' | 'TRANSLATE' | 'SPEECH';
export interface LogEntry { id: number; at: number; level: LogLevel; tag: LogTag; message: string }

export const MAX_ENTRIES = 200;
const MAX_MESSAGE = 300;

let nextId = 1;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

/** Removes credentials from URLs and trims length, so a log line is always safe to display or share. */
export function sanitize(input: unknown): string {
  const raw = input instanceof Error ? input.message : typeof input === 'string' ? input : (() => { try { return JSON.stringify(input); } catch { return String(input); } })();
  const cleaned = String(raw ?? '')
    .replace(/(\w+:\/\/)[^\s/@]+:[^\s/@]*@/g, '$1<credentials>@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    .replace(/((?:token|password|secret|authorization|apikey|api_key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1<redacted>')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > MAX_MESSAGE ? `${cleaned.slice(0, MAX_MESSAGE)}…` : cleaned;
}

export const formatTime = (at: number) => { const d = new Date(at); const p = (n: number, w = 2) => String(n).padStart(w, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`; };
export const formatEntry = (e: LogEntry) => `${formatTime(e.at)} [${e.tag}] ${e.message}`;

function write(level: LogLevel, tag: LogTag, message: unknown) {
  const entry: LogEntry = { id: nextId++, at: Date.now(), level, tag, message: sanitize(message) };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  listeners.forEach((l) => l());
  if (level === 'error' || __DEV__) {
    const line = formatEntry(entry);
    if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
  }
}

export const logger = {
  debug: (tag: LogTag, message: unknown) => write('debug', tag, message),
  info: (tag: LogTag, message: unknown) => write('info', tag, message),
  warn: (tag: LogTag, message: unknown) => write('warn', tag, message),
  error: (tag: LogTag, message: unknown) => write('error', tag, message),
  /** Snapshot for useSyncExternalStore: the array identity changes only when an entry is added or the log is cleared. */
  entries: (): readonly LogEntry[] => entries,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  clear: () => { entries = []; listeners.forEach((l) => l()); },
};
