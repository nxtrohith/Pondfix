import type { ReactNode } from 'react';
import { cx } from './cx';

export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cx('rounded-xl border border-line bg-card', className)} {...rest}>{children}</Tag>;
}

export function CardHeader({ title, description, action, id }: { title: string; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-medium leading-snug text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const CardBody = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('px-5 pb-5 pt-4', className)}>{children}</div>;
