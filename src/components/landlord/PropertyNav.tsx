import Link from 'next/link';

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
    <nav aria-label="Property sections" className="app-property-nav">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={current === item.id ? 'page' : undefined}
          className="app-property-tab"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
