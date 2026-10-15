import type { ReactNode } from 'react';
import { WarningCircle, Tray, Info } from '@phosphor-icons/react/dist/ssr';
import { RetryButton } from './RetryButton';
import { ApiError } from '@/lib/api/client';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink-soft" aria-hidden="true"><Tray size={20} /></span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {children ? <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-ink-soft">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function describeError(error: unknown): { message: string; retryable: boolean; code?: string } {
  if (error instanceof ApiError) return { message: error.message, retryable: error.retryable, code: error.code };
  return { message: 'Something went wrong while loading this data.', retryable: true };
}

/** `server` errors retry via router.refresh(); client components pass `onRetry`. */
export function ErrorState({ error, title = 'Could not load this data', onRetry, server }: { error: unknown; title?: string; onRetry?: () => void; server?: boolean }) {
  const e = describeError(error);
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-crit-bg text-crit-text" aria-hidden="true"><WarningCircle size={20} /></span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-ink-soft">{e.message}{e.code ? ` (${e.code})` : ''}</p>
      {e.retryable ? <div className="mt-4">{server ? <RetryButton /> : <RetryButton onRetry={onRetry} />}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning'; children: ReactNode }) {
  return (
    <div role="note" className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-snug ${tone === 'warning' ? 'border-warn-line bg-warn-bg text-warn-text' : 'border-line bg-brand-pale text-brand-text'}`}>
      <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
