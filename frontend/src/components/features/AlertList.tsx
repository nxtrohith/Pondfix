import Link from 'next/link';
import type { Alert } from '@/lib/api/schemas';
import { formatDateTime } from '@/lib/format';
import { PARAM_ICON, alertCondition, alertTitle } from '@/lib/alerts';
import { ALERT_STATUS_LABEL, ALERT_STATUS_TONE, SEVERITY_TONE } from '@/lib/status';
import { SourceBadge, StatusPill } from '../ui/StatusPill';

export function AlertList({ alerts, pondNames }: { alerts: Alert[]; pondNames: Record<string, string> }) {
  return (
    <ul className="divide-y divide-line/70">
      {alerts.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
          <StatusPill tone={SEVERITY_TONE[a.severity]}>{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</StatusPill>
          <div className="min-w-0 flex-1 basis-56">
            <p className="truncate text-[13px] font-medium text-ink">
              <Link href={`/ponds/${a.pondId}`} className="hover:text-olive-text hover:underline">{pondNames[a.pondId] ?? 'Unknown pond'}</Link>
              <span className="inline-flex items-center gap-1 font-normal text-ink-soft"> / {(() => { const I = PARAM_ICON[a.parameter]; return I ? <I size={13} aria-hidden="true" /> : null; })()}{alertTitle(a)}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">{alertCondition(a)}</p>
          </div>
          <div className="flex items-center gap-2">
            {a.dataSource ? <SourceBadge source={a.dataSource} /> : null}
            <StatusPill tone={ALERT_STATUS_TONE[a.status]}>{ALERT_STATUS_LABEL[a.status]}</StatusPill>
          </div>
          <p className="w-full text-xs tabular-nums text-ink-soft sm:w-auto sm:min-w-[9.5rem] sm:text-right">{formatDateTime(a.lastTriggeredAt)}</p>
        </li>
      ))}
    </ul>
  );
}
