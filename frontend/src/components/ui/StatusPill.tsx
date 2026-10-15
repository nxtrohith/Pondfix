import type { ReactNode } from 'react';
import { cx } from './cx';
import type { Tone } from '@/lib/status';
import type { DataSource } from '@/lib/api/schemas';
import { SOURCE_LABEL } from '@/lib/format';

const TONE: Record<Tone, string> = {
  healthy: 'bg-ok-bg text-ok-text',
  warning: 'bg-warn-bg text-warn-text',
  critical: 'bg-crit-bg text-crit-text',
  muted: 'bg-stale-bg text-stale-text',
  neutral: 'bg-brand-pale text-brand-text',
};

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium', TONE[tone], className)}>{children}</span>;
}

const SOURCE_TONE: Record<DataSource, string> = {
  historical: 'bg-surface text-ink-soft',
  simulated: 'bg-brand-pale text-brand-text',
  live: 'bg-ok-bg text-ok-text',
};
export function SourceBadge({ source }: { source: DataSource }) {
  return <span className={cx('inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium', SOURCE_TONE[source])}>{SOURCE_LABEL[source]}</span>;
}
