import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { Card } from './Card';

export function KpiCard({ label, value, context, icon: IconCmp }: { label: string; value: ReactNode; context?: ReactNode; icon: Icon }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-soft">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-sage-pale text-olive" aria-hidden="true">
          <IconCmp size={18} weight="regular" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-medium leading-none tracking-tight tabular-nums text-ink">{value}</p>
      {context ? <p className="mt-2 text-xs leading-snug text-ink-soft">{context}</p> : null}
    </Card>
  );
}
