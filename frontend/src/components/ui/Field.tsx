'use client';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';
import { cx } from './cx';

const CONTROL = 'h-11 w-full rounded-lg border border-line-strong bg-card px-3 text-base text-ink placeholder:text-ink-soft focus-visible:border-brand disabled:opacity-60';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children(id, hintId)}
      {error ? <p id={hintId} role="alert" className="text-sm font-medium text-crit-text">{error}</p> : hint ? <p id={hintId} className="text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, 'appearance-none pr-9', className)} {...rest}>{children}</select>
      <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(CONTROL, className)} {...rest} />;

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 whitespace-nowrap rounded-md px-3 text-sm pointer-coarse:h-10 font-medium transition-colors duration-150 disabled:opacity-50',
            o.value === value ? 'bg-card text-brand-text shadow-[0_0_0_1px_var(--color-line)]' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
