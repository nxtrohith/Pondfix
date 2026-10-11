import type { ReactNode, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ children, caption, className }: { children: ReactNode; caption: string; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full min-w-[640px] border-collapse text-left text-[13px]', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cx('whitespace-nowrap border-b border-line px-4 py-2.5 text-xs font-medium text-ink-soft first:pl-5 last:pr-5', className)} {...p} />;
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cx('border-b border-line/70 px-4 py-3 align-middle text-ink first:pl-5 last:pr-5', className)} {...p} />;
export const Tr = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cx('transition-colors duration-150 hover:bg-surface/60 [&:last-child>td]:border-b-0', className)} {...p} />;
