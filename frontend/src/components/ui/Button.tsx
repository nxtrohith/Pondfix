import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover border border-transparent',
  secondary: 'bg-card text-ink border border-line hover:bg-surface',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-surface hover:text-ink',
};

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: { variant?: Variant; size?: 'sm' | 'md'; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-10 px-3.5 text-sm pointer-coarse:h-11' : 'h-11 px-4 text-[15px]',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export const linkButtonClass = (variant: Variant = 'secondary', size: 'sm' | 'md' = 'md') =>
  cx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 active:translate-y-px', size === 'sm' ? 'h-10 px-3.5 text-sm pointer-coarse:h-11' : 'h-11 px-4 text-[15px]', VARIANT[variant]);
