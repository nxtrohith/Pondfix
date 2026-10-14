import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading page">
      <Skeleton className="mb-2 h-8 w-48" /><Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-16" /><Skeleton className="mt-3 h-3 w-32" /></Card>)}</div>
      <Card className="mt-6 p-5"><Skeleton className="h-4 w-40" /><Skeleton className="mt-4 h-64 w-full" /></Card>
    </div>
  );
}
