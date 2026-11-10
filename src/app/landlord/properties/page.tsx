import { PageHeader } from '@/components/ui/PageHeader';
import Link from 'next/link';
import { Building2, DoorOpen, Plus, Users, Wrench } from 'lucide-react';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { formatPeso } from '@/lib/utils/currency';
import { RoomStatusBadge } from '@/components/ui/StatusBadge';

export const metadata = { title: 'Properties' };

export default async function PropertiesPage() {
  const user = await requireLandlord();
  const properties = await PropertyService.getLandlordProperties(user.id);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader eyebrow="Your portfolio" title="Properties" description="Rooms, residents, and property activity."
        action={<Link href="/landlord/properties/new" className="app-primary-action"><Plus size={18} />Add property</Link>} />

      {properties.length === 0 ? (
        <div className="card-abangta rounded-3xl p-8 text-center">
          <Building2 size={36} className="mx-auto mb-3 text-primary" />
          <h2 className="text-lg font-semibold">No properties yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add your first boarding house, then create rooms and configure utilities.
          </p>
          <Link
            href="/landlord/properties/new"
            className="mt-5 inline-flex rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Add Property
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {properties.map((property) => {
            const occupied = property.rooms.filter((room) => room.status === 'OCCUPIED').length;
            const vacant = property.rooms.filter((room) => room.status === 'VACANT').length;
            const maintenance = property.rooms.filter(
              (room) => room.status === 'MAINTENANCE'
            ).length;
            const monthlyRent = property.rooms.reduce(
              (sum, room) => sum + Number(room.monthlyRent),
              0
            );
            const water = property.utilityConfigs.find((config) => config.utilityType === 'WATER');
            const electricity = property.utilityConfigs.find(
              (config) => config.utilityType === 'ELECTRICITY'
            );

            return (
              <Link
                key={property.id}
                href={`/landlord/properties/${property.id}`}
                className="card-abangta app-property-card block rounded-3xl p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{property.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {property.address}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Building2 size={20} />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <MiniStat icon={<DoorOpen size={14} />} label="Rooms" value={property._count.rooms} />
                  <MiniStat icon={<Users size={14} />} label="Occupied" value={occupied} />
                  <MiniStat icon={<Wrench size={14} />} label="Maint." value={maintenance} />
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {occupied > 0 && <RoomStatusBadge status="OCCUPIED" />}
                  {vacant > 0 && <RoomStatusBadge status="VACANT" />}
                  {maintenance > 0 && <RoomStatusBadge status="MAINTENANCE" />}
                </div>

                <div className="rounded-2xl bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Listed room rent
                  </p>
                  <p className="mt-1 text-2xl font-bold">{formatPeso(monthlyRent)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Water: {water ? labelUtility(water.billingMethod) : 'Not configured'} ·
                    Electricity: {electricity ? labelUtility(electricity.billingMethod) : ' Not configured'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-background px-3 py-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function labelUtility(method: string) {
  if (method === 'INCLUDED') return 'Included';
  if (method === 'FIXED_RATE') return 'Fixed';
  return 'Metered';
}
