import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, visual }: { title: string; description?: ReactNode; actions?: ReactNode; /** Optional illustration shown before the title (decorative; the status is also stated in words). */ visual?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-4">
        {visual ? <div aria-hidden="true" className="hidden shrink-0 sm:block">{visual}</div> : null}
        <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[65ch] text-sm text-ink-soft">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
