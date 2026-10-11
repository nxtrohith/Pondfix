import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/states';
import { linkButtonClass } from '@/components/ui/Button';

export default function NotFound() {
  return <Card><EmptyState title="Page not found" action={<Link href="/" className={linkButtonClass('primary')}>Back to overview</Link>}>The page you opened does not exist.</EmptyState></Card>;
}
