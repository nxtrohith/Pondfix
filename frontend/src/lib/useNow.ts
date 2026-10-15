'use client';
import { useSyncExternalStore } from 'react';

// "Now", rounded to the minute and refreshed every 30 s, so ages ("Detected 5 min ago") stay right on an open page without each card
// running its own timer, and server and client agree within the same minute.
const MINUTE = 60_000;
let now = Math.floor(Date.now() / MINUTE) * MINUTE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => { const next = Math.floor(Date.now() / MINUTE) * MINUTE; if (next !== now) { now = next; listeners.forEach((l) => l()); } }, 30_000);
  return () => { listeners.delete(cb); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
export const useNow = () => useSyncExternalStore(subscribe, () => now, () => now);
