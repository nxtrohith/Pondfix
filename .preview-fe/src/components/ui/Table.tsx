import type { ReactNode, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ children, caption, className }: { children: ReactNode; caption: string; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full min-w-[720px] border-separate border-spacing-0 text-left text-[13px]', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
/** Header cells: tinted band, semibold, strong bottom rule. `sticky` pins the first column while scrolling sideways. */
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cx('whitespace-nowrap border-b-2 border-line-strong bg-head px-4 py-3 text-[13px] font-semibold text-ink first:pl-5 last:pr-5 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-l-line/70', className)} {...p} />;
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cx('border-b border-line/70 px-4 py-3.5 align-middle font-normal text-ink first:pl-5 last:pr-5 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-l-line/50', className)} {...p} />;
/** Zebra striping and a solid hover tint (solid so sticky cells that inherit it never show content scrolling beneath). */
export const Tr = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cx('bg-card transition-colors duration-150 even:bg-zebra hover:bg-hover [&:last-child>td]:border-b-0', className)} {...p} />;
/** Sticky first column: pass to the first Th/Td of each row. Inherits the row background. */
export const STICKY_COL = 'sticky left-0 z-[1] bg-inherit shadow-[1px_0_0_var(--color-line)]';
