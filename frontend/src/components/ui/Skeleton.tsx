import { cx } from './cx';

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden="true" className={cx('skeleton', className)} />;

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 px-5 pb-5 pt-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} className="h-5" />)}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <div role="status" aria-label="Loading chart" className="px-5 pb-5 pt-4"><div aria-hidden="true" className="skeleton w-full" style={{ height }} /></div>;
}
