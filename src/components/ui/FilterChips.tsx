import Link from 'next/link';
import { cn } from '@/lib/utils';

export function FilterChips({
  items,
}: {
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    <nav className="flex flex-wrap gap-2 p-1" aria-label="Filter results">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-medium ring-1 transition',
            item.active
              ? 'bg-foreground text-background ring-foreground'
              : 'bg-white text-muted-foreground ring-border hover:text-foreground'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
