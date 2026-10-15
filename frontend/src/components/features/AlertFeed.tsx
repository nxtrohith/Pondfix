'use client';
import { useState } from 'react';
import { ApiError, browserApi } from '@/lib/api/client';
import type { Alert } from '@/lib/api/schemas';
import { AlertCardList } from './AlertCard';

/** A list of alerts with "Mark as seen". Marking an alert as seen does not close it: it stays open until readings recover. */
export function AlertFeed({ alerts, pondNames, compact, showGuidance, stepsLimit, readOnly }: { alerts: Alert[]; pondNames: Record<string, string>; compact?: boolean; showGuidance?: boolean; stepsLimit?: number; /** No "Mark as seen" (used for demo fixtures, which have no real alert to update). */ readOnly?: boolean }) {
  const [patched, setPatched] = useState<Record<string, Alert>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function markSeen(a: Alert) {
    setBusy(a.id); setError(null);
    try { const r = await browserApi().acknowledgeAlert(a.id); setPatched((p) => ({ ...p, [a.id]: r.alert })); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not mark this as seen.'); }
    finally { setBusy(null); }
  }
  return (
    <div className="space-y-3">
      <AlertCardList alerts={alerts.map((a) => patched[a.id] ?? a)} pondNames={pondNames} compact={compact} showGuidance={showGuidance} stepsLimit={stepsLimit} onMarkSeen={readOnly ? undefined : markSeen} busy={busy !== null} />
      {error ? <p role="alert" className="text-sm text-crit-text">{error}</p> : null}
    </div>
  );
}
