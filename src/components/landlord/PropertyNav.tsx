import Link from 'next/link';
import { cn } from '@/lib/utils';

export function PropertyNav({
  propertyId,
  current,
}: {
  propertyId: string;
  current:
    | 'overview'
    | 'tenants'
    | 'bills'
    | 'readings'
    | 'maintenance'
    | 'announcements';
}) {
  const items = [
    { id: 'overview', href: `/landlord/properties/${propertyId}`, label: 'Overview' },
    { id: 'tenants', href: `/landlord/properties/${propertyId}/tenants`, label: 'Tenants' },
    { id: 'bills', href: `/landlord/properties/${propertyId}/bills`, label: 'Bills' },
    { id: 'readings', href: `/landlord/properties/${propertyId}/readings`, label: 'Meters' },
    { id: 'maintenance', href: `/landlord/properties/${propertyId}/maintenance`, label: 'Maintenance' },
    { id: 'announcements', href: `/landlord/properties/${propertyId}/announcements`, label: 'News' },
  ] as const;

  return (
    <nav aria-label="Property sections" className="mb-5 grid grid-cols-3 gap-2 p-1 sm:flex sm:flex-wrap">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={current === item.id ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-2 py-2 text-xs sm:px-4 sm:text-sm font-medium ring-1',
            current === item.id
              ? 'bg-foreground text-background ring-foreground'
              : 'bg-white text-muted-foreground ring-border'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
