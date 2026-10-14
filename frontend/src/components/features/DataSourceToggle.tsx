'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, browserApi } from '@/lib/api/client';
import type { PondDataSource } from '@/lib/api/schemas';
import { Segmented } from '../ui/Field';
import { Notice } from '../ui/states';

type Props =
  | { scope: 'pond'; pondId: string; pondName: string; value: PondDataSource }
  | { scope: 'all'; value: PondDataSource | 'mixed' };

const OPTIONS: { value: PondDataSource; label: string }[] = [{ value: 'sensor', label: 'Sensor' }, { value: 'simulator', label: 'Server' }];

/**
 * Where readings come from: Sensor (hardware) or Server (the simulator service, synthetic values). The shown value is whatever the API
 * last confirmed, so a failed save never looks like a success.
 */
export function DataSourceToggle(props: Props) {
  const api = useMemo(() => browserApi(), []);
  const router = useRouter();
  const [value, setValue] = useState<PondDataSource | 'mixed'>(props.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = props.scope === 'pond' ? props.pondName : 'all ponds';

  async function change(next: PondDataSource) {
    if (next === value) return;
    setBusy(true); setError(null);
    try {
      if (props.scope === 'pond') await api.setDataSource(props.pondId, next); else await api.setAllDataSource(next);
      setValue(next);
      router.refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The data source could not be changed.'); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">Data source{props.scope === 'all' ? ' for all ponds' : ''}</p>
        <p className="text-xs text-ink-soft" aria-live="polite">
          {value === 'mixed' ? 'Ponds use different sources. Pick one to apply it to every pond.'
            : value === 'simulator' ? `${subject}: synthetic readings from the AquaGuard simulator (not measured). Start it with "npm run simulator".`
            : `${subject}: readings from the pond's sensors. Nothing appears until the hardware is connected.`}
        </p>
      </div>
      <Segmented label={`Data source for ${subject}`} value={value as PondDataSource} options={OPTIONS.map((o) => ({ ...o, disabled: busy }))} onChange={(v) => void change(v)} />
      {error ? <div className="basis-full"><Notice tone="warning">{error}</Notice></div> : null}
    </div>
  );
}
