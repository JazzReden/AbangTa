import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { FilterChips } from '@/components/ui/FilterChips';
import { TenancyStatusBadge } from '@/components/ui/StatusBadge';
import { JoinRequestActions } from '@/components/landlord/JoinRequestActions';
import { endTenancyAction, reviewJoinRequestAction, reviewRoomAccessAction, setTenantParkingAction } from '@/app/landlord/tenants/actions';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { RoomJoinService } from '@/services/tenants/room-join.service';
import { RoomShareService } from '@/services/tenants/room-share.service';
import { RoomShare } from '@/components/landlord/RoomShare';
import { formatPeso } from '@/lib/utils/currency';
import QRCode from 'qrcode';

export const metadata = { title: 'Tenants' };
export default async function PropertyTenantsPage({ params, searchParams }: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ status?: 'ACTIVE' | 'ENDED' | 'PENDING' }>;
}) {
  const { propertyId } = await params;
  const { status } = await searchParams;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(propertyId, user.id);
  if (!property) notFound();
  const tenancies = await TenantService.getPropertyTenants(propertyId, user.id, status);
  const [legacyRequests, roomRequests, links] = await Promise.all([
    RoomJoinService.propertyRequests(propertyId, user.id), RoomShareService.propertyRequests(propertyId, user.id), RoomShareService.links(propertyId, user.id),
  ]);
  const requests = [
    ...legacyRequests.map(request => ({ ...request, roomNumber: request.invite.tenancy.room.roomNumber, beds: undefined, action: reviewJoinRequestAction })),
    ...roomRequests.map(request => ({ ...request, roomNumber: request.room.roomNumber,
      beds: request.room.rentalMode === 'PER_BED' ? property.rooms.find(room => room.id === request.roomId)?.beds.filter(bed => bed.status === 'VACANT' && !bed.tenancies.length).map(bed => ({ id: bed.id, label: bed.label, rent: bed.monthlyRent.toFixed(2) })) ?? [] : undefined,
      action: reviewRoomAccessAction })),
  ];
  const shares = await Promise.all(links.map(async room => ({ ...room, qr: await QRCode.toDataURL(room.invitationUrl, { width: 256, margin: 4 }) })));
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <h1 className="mb-2 text-2xl font-bold">{property.name}</h1>
    <PropertyNav propertyId={propertyId} current="tenants" />
    {requests.length > 0 && <section className="mb-6 space-y-3 border-y py-5">
      <h2 className="font-semibold">Room join requests</h2>
      {requests.map(request => <article key={request.id} className="rounded-xl border bg-white p-4">
        <p className="font-semibold">{request.user.name}</p>
        <p className="text-sm text-muted-foreground">{request.user.email ?? request.user.phone} / Room {request.roomNumber}</p>
        <JoinRequestActions beds={request.beds} approve={request.action.bind(null, request.id, true)} decline={request.action.bind(null, request.id, false)} />
      </article>)}
    </section>}
    <div className="mb-5"><FilterChips items={[
      { href: `/landlord/properties/${propertyId}/tenants`, label: 'All', active: !status },
      { href: `/landlord/properties/${propertyId}/tenants?status=ACTIVE`, label: 'Active', active: status === 'ACTIVE' },
      { href: `/landlord/properties/${propertyId}/tenants?status=ENDED`, label: 'Former', active: status === 'ENDED' },
    ]} /></div>
    <section className="space-y-3">
      {!tenancies.length ? <div className="card-abangta rounded-3xl p-8 text-center"><h2 className="font-semibold">No tenants yet</h2></div> : tenancies.map(tenancy =>
        <article key={tenancy.id} className="card-abangta rounded-3xl p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{tenancy.tenant.name}</p>
            <p className="text-sm text-muted-foreground">{tenancy.tenant.email ?? tenancy.tenant.phone}</p><p className="mt-2 text-sm">Room {tenancy.room.roomNumber}{tenancy.bed ? ' / ' + tenancy.bed.label : ''}</p><p className="mt-1 text-sm text-muted-foreground">{formatPeso(tenancy.monthlyRent)} / month</p></div><TenancyStatusBadge status={tenancy.status} /></div>
          {tenancy.status === 'ACTIVE' && <StatefulForm action={setTenantParkingAction.bind(null, propertyId, tenancy.id)} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm">
              <span className="mb-1.5 block font-medium">Parking</span>
              <select key={tenancy.parkingMode} name="parkingMode" defaultValue={tenancy.parkingMode} className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm">
                <option value="NOT_APPLICABLE">Not applicable</option><option value="FREE">Free parking</option><option value="USE_PROPERTY_RATE">Uses parking - property rate</option>
              </select>
            </label>
            <SubmitButton className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Save parking</SubmitButton>
          </StatefulForm>}
          <Link href={`/landlord/properties/${propertyId}/tenants/${tenancy.id}/funds`} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Deposits &amp; advances</Link>
          {tenancy.status !== 'ENDED' && <form action={endTenancyAction.bind(null, propertyId, tenancy.id)} className="mt-4"><button className="rounded-2xl bg-muted px-4 py-2 text-sm font-medium">End tenancy</button></form>}
        </article>)}
    </section>
    <section className="mt-8 border-t pt-6">
      <h2 className="mb-4 text-lg font-semibold">Room invitations</h2>
      {!shares.length && <p className="text-sm text-muted-foreground">No rooms added yet.</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{shares.map(room => <article key={room.id} className="card-abangta rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">Room {room.roomNumber}</h3><span className="text-sm text-muted-foreground">{room.rentalMode === 'PER_BED' && room.beds.length ? 'From ' + formatPeso(Math.min(...room.beds.map(bed => Number(bed.monthlyRent)))) + ' / bed / month' : formatPeso(room.monthlyRent) + ' / month'}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{room.status === 'MAINTENANCE' ? 'Under maintenance' : 'Capacity: ' + room.capacity}</p>
        <RoomShare url={room.invitationUrl} qr={room.qr} propertyName={property.name} roomNumber={room.roomNumber} />
      </article>)}</div>
    </section>
  </div>;
}
