import { CheckCircle, Clock, Minus, Question, Warning, WarningOctagon } from '@phosphor-icons/react/dist/ssr';
import type { RiskStatus } from '@/lib/api/schemas';
import { RISK_LABEL, RISK_TONE, type Tone } from '@/lib/status';
import { POND_STATUS } from '@/lib/terms';
import { cx } from './cx';

const TONE: Record<Tone, string> = {
  healthy: 'bg-ok-bg text-ok-text',
  warning: 'bg-warn-bg text-warn-text',
  critical: 'bg-crit-bg text-crit-text ring-1 ring-inset ring-crit-text/30',
  muted: 'bg-stale-bg text-stale-text',
  neutral: 'bg-brand-pale text-brand-text',
};
const ICON = { NORMAL: CheckCircle, WARNING: Warning, CRITICAL: WarningOctagon, STALE: Clock, NO_DATA: Clock, UNKNOWN: Minus, ERROR: Question } as const;

/**
 * One status indicator for the whole app: icon + words + colour, so meaning never depends on colour alone.
 * scope "pond" uses pond wording (Healthy / Attention needed / Critical); "factor" uses per-reading wording (Normal / Warning / Critical).
 */
export function StatusBadge({ status, scope = 'factor', className }: { status: RiskStatus | 'ERROR'; scope?: 'pond' | 'factor'; className?: string }) {
  const Icon = ICON[status];
  const tone = status === 'ERROR' ? 'muted' : RISK_TONE[status];
  const label = scope === 'pond' ? POND_STATUS[status].label : status === 'ERROR' ? POND_STATUS.ERROR.label : RISK_LABEL[status];
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium', status === 'CRITICAL' && 'font-semibold', TONE[tone], className)}>
      <Icon size={14} weight={status === 'CRITICAL' || status === 'WARNING' ? 'fill' : 'regular'} aria-hidden="true" />
      {label}
    </span>
  );
}
