import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  Bolt,
  DoorOpen,
  Droplets,
  Plus,
  Settings2,
  Users,
  Wifi,
} from 'lucide-react';
import type { BillingMethod, UtilityConfig } from '@prisma/client';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { formatPeso } from '@/lib/utils/currency';
import { RoomStatusBadge, TenancyStatusBadge } from '@/components/ui/StatusBadge';
import { FilterChips } from '@/components/ui/FilterChips';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { RoomStatusSelect } from '@/components/landlord/RoomStatusSelect';
import { BedManagement } from '@/components/landlord/BedManagement';
import { AdditionalCharges } from '@/components/landlord/AdditionalCharges';
import { propertyChargeDefaults } from '@/lib/utils/additional-charges';
import { createRoomAction, setUtilityConfigAction, updateRoomStatusAction, savePropertyChargesAction } from '@/app/landlord/properties/actions';

export const metadata = { title: 'Property Detail' };

export default async function PropertyDetailPage({ params: paramsPromise, searchParams: searchParamsPromise }: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(params.propertyId, user.id);

  if (!property) notFound();

  const statusFilter = searchParams.status;
  const rooms = property.rooms.filter((room) =>
    !statusFilter || statusFilter === 'ALL' ? true : room.status === statusFilter
  );
  const activeTenancies = property.rooms.flatMap((room) => room.tenancies);
  const occupied = property.rooms.filter((room) => room.status === 'OCCUPIED').length;
  const vacant = property.rooms.filter((room) => room.status === 'VACANT').length;
  const monthlyRent = activeTenancies.reduce(
    (sum, tenancy) => sum + Number(tenancy.monthlyRent),
    0
  );
  const water = property.utilityConfigs.find((config) => config.utilityType === 'WATER');
  const electricity = property.utilityConfigs.find(
    (config) => config.utilityType === 'ELECTRICITY'
  );
  const createRoom = createRoomAction.bind(null, property.id);
  const chargeDefaults = propertyChargeDefaults(property.billingCharges);
  const wifi = chargeDefaults.find(charge => charge.itemType === 'WIFI');
  const parking = chargeDefaults.find(charge => charge.itemType === 'PARKING');

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <Link
        href="/landlord/properties"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Properties
      </Link>

      <section className="card-abangta mb-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Boarding house
            </p>
            <h1 className="mt-1 text-2xl font-bold">{property.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{property.address}</p>
            <Link
              href={`/landlord/properties/${property.id}/edit`}
              className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Edit property
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 md:min-w-80">
            <HeroStat label="Rooms" value={property.rooms.length} icon={<DoorOpen size={16} />} />
            <HeroStat label="Occupied" value={occupied} icon={<Users size={16} />} />
            <HeroStat label="Vacant" value={vacant} icon={<Plus size={16} />} />
          </div>
        </div>
      </section>

      <PropertyNav propertyId={property.id} current="overview" />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ValueCard label="Active monthly rent" value={formatPeso(monthlyRent)} icon={<Banknote />} />
        <UtilityCard title="Water" config={water} icon={<Droplets />} />
        <UtilityCard title="Electricity" config={electricity} icon={<Bolt />} />
        <div className="card-abangta rounded-3xl p-5">
          <div className="mb-3 inline-flex rounded-2xl bg-muted p-2 text-foreground">
            <Wifi />
          </div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Wi-Fi</p>
          <p className="mt-1 text-lg font-bold">{chargeLabel(wifi)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Parking: {chargeLabel(parking)}</p>
          <Link
            href="#monthly-charge-defaults"
            className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Wi-Fi &amp; parking setup
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Room management
              </p>
              <h2 className="text-lg font-bold">Rooms</h2>
            </div>
            <FilterChips
              items={[
                { href: `/landlord/properties/${property.id}`, label: 'All', active: !statusFilter },
                {
                  href: `/landlord/properties/${property.id}?status=OCCUPIED`,
                  label: 'Occupied',
                  active: statusFilter === 'OCCUPIED',
                },
                {
                  href: `/landlord/properties/${property.id}?status=VACANT`,
                  label: 'Vacant',
                  active: statusFilter === 'VACANT',
                },
                {
                  href: `/landlord/properties/${property.id}?status=MAINTENANCE`,
                  label: 'Maintenance',
                  active: statusFilter === 'MAINTENANCE',
                },
              ]}
            />
          </div>

          {rooms.length === 0 ? (
            <div className="card-abangta rounded-3xl p-8 text-center">
              <DoorOpen size={34} className="mx-auto mb-3 text-primary" />
              <h3 className="font-semibold">No rooms yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first room to begin assigning tenants and billing rent.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rooms.map((room) => {
                return (
                  <article key={room.id} className="card-abangta rounded-3xl p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Room
                        </p>
                        <h3 className="text-xl font-bold">{room.roomNumber}</h3>
                      </div>
                      <RoomStatusBadge status={room.status} />
                    </div>
                    <div className="mb-3 rounded-2xl bg-background p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        {room.rentalMode === 'PER_BED' ? 'Monthly rent per bed' : 'Monthly rent'}
                      </p>
                      <p className="mt-1 text-xl font-bold">{room.rentalMode === 'PER_BED' && room.beds.length ? formatPeso(Math.min(...room.beds.map(bed => Number(bed.monthlyRent)))) + (Math.max(...room.beds.map(bed => Number(bed.monthlyRent))) !== Math.min(...room.beds.map(bed => Number(bed.monthlyRent))) ? ' to ' + formatPeso(Math.max(...room.beds.map(bed => Number(bed.monthlyRent)))) : '') : formatPeso(room.monthlyRent)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-3 py-1">
                        Capacity {room.capacity}
                      </span>
                    </div>
                    {room.tenancies.length ? room.tenancies.map(tenancy => (
                      <div key={tenancy.id} className="mt-4 border-t border-border/60 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{tenancy.tenant.name}</p>
                            {tenancy.bed && <p className="text-xs text-muted-foreground">{tenancy.bed.label}</p>}
                            <p className="text-xs text-muted-foreground">
                              {tenancy.tenant.email}
                            </p>
                          </div>
                          <TenancyStatusBadge status={tenancy.status} />
                        </div>
                      </div>
                    )) : (
                      <Link
                        href={`/landlord/properties/${property.id}/tenants`}
                        className="mt-4 block rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700"
                      >
                        Ready for tenant assignment.
                      </Link>
                    )}
                    <RoomStatusSelect
                      action={updateRoomStatusAction.bind(null, property.id, room.id)}
                      defaultValue={room.status}
                      roomId={room.id}
                    />
                    {room.rentalMode === 'PER_BED' && <p className="mt-3 text-xs text-muted-foreground">{room.beds.filter(bed => bed.status === 'VACANT' && !bed.tenancies.length).length} available beds / {room.beds.length} beds</p>}
                    <BedManagement propertyId={property.id} room={room} />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <StatefulForm action={createRoom} className="card-abangta space-y-3 rounded-3xl p-5">
            <div className="mb-1 flex items-center gap-2">
              <Plus size={17} className="text-primary" />
              <h2 className="font-semibold">Add room</h2>
            </div>
            <Input name="roomNumber" label="Room number" placeholder="101" required />
            <label className="block"><span className="mb-1.5 block text-sm font-medium">Rental mode</span>
              <select name="rentalMode" defaultValue="WHOLE_ROOM" className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm">
                <option value="WHOLE_ROOM">Whole room</option><option value="PER_BED">Individual beds</option>
              </select></label>
            <Input name="capacity" label="Capacity" type="number" min="1" defaultValue="1" required />
            <Input name="monthlyRent" label="Monthly rent (room or each bed)" type="number" min="0.01" step="0.01" placeholder="4000" required />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Description</span>
              <textarea
                name="description"
                rows={3}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <SubmitButton className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              Save Room
            </SubmitButton>
          </StatefulForm>

          <StatefulForm action={savePropertyChargesAction.bind(null, property.id)} className="card-abangta space-y-3 rounded-3xl p-5">
            <div id="monthly-charge-defaults" className="scroll-mt-24">
              <AdditionalCharges key={JSON.stringify(chargeDefaults)} initialCharges={chargeDefaults} allowCustom={false} legend="Monthly defaults (per tenant)" />
            </div>
            <SubmitButton className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Save monthly defaults</SubmitButton>
          </StatefulForm>
          <UtilityForm propertyId={property.id} title="Water setup" utilityType="WATER" config={water} />
          <UtilityForm
            propertyId={property.id}
            title="Electricity setup"
            utilityType="ELECTRICITY"
            config={electricity}
          />
        </aside>
      </div>
    </div>
  );
}

function chargeLabel(charge?: { treatment: string; amount: number }) {
  if (!charge) return 'Not applicable';
  if (charge.treatment === 'INCLUDED') return 'Included in Rent';
  if (charge.treatment === 'FREE') return 'Free';
  return formatPeso(charge.amount) + ' / month';
}

function HeroStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-background p-3 text-center">
      <div className="mx-auto mb-1 flex justify-center text-muted-foreground">{icon}</div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function ValueCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactElement;
}) {
  return (
    <div className="card-abangta rounded-3xl p-5">
      <div className="mb-3 inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function UtilityCard({
  title,
  config,
  icon,
}: {
  title: string;
  config?: UtilityConfig;
  icon: React.ReactElement;
}) {
  return (
    <div className="card-abangta rounded-3xl p-5">
      <div className="mb-3 inline-flex rounded-2xl bg-muted p-2 text-foreground">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <p className="mt-1 text-lg font-bold">
        {config ? utilityLabel(config.billingMethod) : 'Not configured'}
      </p>
      {config?.billingMethod === 'FIXED_RATE' && config.fixedAmount && (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPeso(config.fixedAmount)} per month
        </p>
      )}
      {config?.billingMethod === 'METERED' && config.ratePerUnit && (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPeso(config.ratePerUnit)} / {config.unit}
        </p>
      )}
    </div>
  );
}

function UtilityForm({
  propertyId,
  title,
  utilityType,
  config,
}: {
  propertyId: string;
  title: string;
  utilityType: 'WATER' | 'ELECTRICITY';
  config?: UtilityConfig;
}) {
  const action = setUtilityConfigAction.bind(null, propertyId);
  return (
    <StatefulForm action={action} className="card-abangta space-y-3 rounded-3xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <Settings2 size={17} className="text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <input type="hidden" name="utilityType" value={utilityType} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Billing method</span>
        <select
          name="billingMethod"
          defaultValue={config?.billingMethod ?? 'INCLUDED'}
          className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="INCLUDED">Included in rent</option>
          <option value="FIXED_RATE">Fixed rate</option>
          <option value="METERED">Metered</option>
        </select>
      </label>
      <Input
        name="fixedAmount"
        label="Fixed amount"
        type="number"
        min="0"
        step="0.01"
        defaultValue={config?.fixedAmount?.toString() ?? ''}
        placeholder="150"
      />
      <Input
        name="ratePerUnit"
        label="Meter rate"
        type="number"
        min="0"
        step="0.0001"
        defaultValue={config?.ratePerUnit?.toString() ?? ''}
        placeholder={utilityType === 'WATER' ? '40' : '15'}
      />
      <Input
        name="unit"
        label="Unit"
        defaultValue={config?.unit ?? (utilityType === 'WATER' ? 'm3' : 'kWh')}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Shared assignment</span>
        <select
          name="splitMethod"
          defaultValue={config?.splitMethod ?? 'EQUAL_SPLIT'}
          className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="EQUAL_SPLIT">Equal split</option>
          <option value="PER_ROOM">Per room meter</option>
        </select>
      </label>
      <SubmitButton className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-background">
        Save Utility
      </SubmitButton>
    </StatefulForm>
  );
}

function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function utilityLabel(method: BillingMethod) {
  if (method === 'INCLUDED') return 'Included in Rent';
  if (method === 'FIXED_RATE') return 'Fixed Rate';
  return 'Metered';
}
