'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, X } from '@phosphor-icons/react/dist/ssr';
import { browserApi } from '@/lib/api/client';
import type { Alert, ParamSummary } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { PARAM_ICON } from '@/lib/alerts';
import { PARAM_LABEL, formatValue, unitLabel } from '@/lib/format';
import type { PondSnapshot } from '@/lib/farm';
import { POND_STATUS } from '@/lib/terms';
import { StatusBadge } from '../ui/StatusBadge';
import { LastUpdated } from '../ui/LastUpdated';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/states';
import { linkButtonClass } from '../ui/Button';
import { AlertFeed } from '../features/AlertFeed';
import { ForecastOutlook } from '../features/ForecastOutlook';

const PARAMS = ['dissolved_oxygen', 'ph', 'temperature'] as const;

/** The selected pond: status, current readings, current problems, forecast (clearly separate), and the way to its full page. */
export function PondPanel({ snap, alerts, readings, demo, onClose }: { snap: PondSnapshot; alerts: Alert[]; readings: Record<string, ParamSummary>; demo: boolean; onClose: () => void }) {
  const api = useMemo(() => browserApi(), []);
  // Forecasts are fetched when a pond is SELECTED (never on hover), once per selection, and never for demo fixtures.
  const preds = useApiQuery((s) => api.predictions(snap.id, {}, s), [snap.id], !demo);
  const problems = alerts.filter((a) => a.origin === 'observed' && a.status !== 'RESOLVED');
  return (
    <aside aria-label={`Selected pond: ${snap.name}`} className="rounded-xl border border-line bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-ink">{snap.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-soft">{snap.id}</p>
          <div className="mt-2"><StatusBadge status={snap.risk} scope="pond" /></div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close pond details" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="space-y-5 px-5 py-4 text-[13px]">
        <p className="text-ink-soft">{POND_STATUS[snap.risk].summary}</p>
        {demo ? <p className="rounded-lg bg-sage-pale px-3 py-2 text-xs text-olive-text">Demo fixture. These values are made up for illustration and are not from any pond.</p> : null}

        <section aria-label="Current readings">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Current readings</h4>
          <ul className="mt-2 space-y-2">
            {PARAMS.map((p) => { const r = snap.readings.find((x) => x.parameter === p); const Icon = PARAM_ICON[p]; return (
              <li key={p} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-ink-soft">{Icon ? <Icon size={14} aria-hidden="true" /> : null}{PARAM_LABEL[p]}</span>
                {r ? <span className="flex items-center gap-2"><span className="tabular-nums font-medium text-ink">{formatValue(r.value, p)} {unitLabel(r.unit)}</span><StatusBadge status={r.risk} /></span> : <span className="text-ink-soft">No reading</span>}
              </li>
            ); })}
          </ul>
          <p className="mt-2 text-xs text-ink-soft"><LastUpdated at={snap.latestAt} ageMinutes={snap.latestAgeMinutes} /></p>
        </section>

        <section aria-label="Current problems">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Current problems</h4>
          <div className="mt-2">
            {problems.length ? <AlertFeed alerts={problems} pondNames={{ [snap.id]: snap.name }} compact readOnly={demo} />
              : <p className="text-ink-soft">{snap.risk === 'STALE' || snap.risk === 'NO_DATA' ? 'Nothing can be checked: there is no recent reading.' : 'No current problems.'}</p>}
          </div>
        </section>

        <section aria-label="Forecast">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Forecast (estimates, not measurements)</h4>
          <div className="mt-2">
            {demo ? <p className="text-ink-soft">Forecasts are not available for demo fixtures.</p>
              : preds.loading && !preds.data ? <Skeleton className="h-32 w-full" />
              : preds.error ? <ErrorState error={preds.error} title="Could not load the forecast" onRetry={preds.reload} />
              : <ForecastOutlook predictions={preds.data?.items ?? []} readings={readings} columns={1} />}
          </div>
        </section>
      </div>
      <div className="border-t border-line px-5 py-4">
        {demo ? <p className="text-xs text-ink-soft">Demo ponds have no details page.</p>
          : <Link href={`/ponds/${snap.id}`} className={linkButtonClass('primary', 'md')}>Open pond details <ArrowRight size={14} aria-hidden="true" /></Link>}
      </div>
    </aside>
  );
}
