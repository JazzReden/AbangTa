import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { saveBedAction, archiveBedAction, saveRoomRentalAction } from '@/app/landlord/properties/actions';
import { formatPeso } from '@/lib/utils/currency';

type Bed = { id: string; label: string; monthlyRent: { toString(): string }; status: string;
  tenancies: Array<{ id: string; startDate: Date; endDate: Date | null; status: string; tenant: { name: string } }> };
const field = 'w-full min-w-0 rounded-2xl border border-input bg-background px-3 py-2 text-sm';
const button = 'rounded-2xl bg-muted px-4 py-2 text-sm font-medium';

export function BedManagement({ propertyId, room }: { propertyId: string; room: { id: string; capacity: number; rentalMode: string; beds: Bed[] } }) {
  return <details className="mt-4 border-t border-border/60 pt-3">
    <summary className="cursor-pointer text-sm font-medium text-primary">Rental settings &amp; beds</summary>
    <StatefulForm action={saveRoomRentalAction.bind(null, propertyId, room.id)} className="mt-3 space-y-3">
      <label className="block text-sm"><span className="mb-1 block">Rental mode</span>
        <select key={room.rentalMode} name="rentalMode" defaultValue={room.rentalMode} className={field}>
          {room.rentalMode === 'LEGACY_SHARED' && <option value="LEGACY_SHARED">Existing shared room</option>}
          <option value="WHOLE_ROOM">Whole room</option><option value="PER_BED">Individual beds</option>
        </select></label>
      <label className="block text-sm"><span className="mb-1 block">Capacity</span><input name="capacity" type="number" min="1" max="20" required defaultValue={room.capacity} className={field} /></label>
      <SubmitButton className={button}>Save rental settings</SubmitButton>
    </StatefulForm>
    {room.rentalMode === 'PER_BED' && <div className="mt-4 divide-y divide-border/60">
      {room.beds.map(bed => <div key={bed.id} className="py-3">
        <p className="text-sm font-semibold">{bed.label} / {formatPeso(bed.monthlyRent.toString())}</p>
        <p className="mt-1 text-xs text-muted-foreground">{bed.tenancies.length ? bed.tenancies.map(t => t.tenant.name + ' / ' + new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }).format(t.startDate)).join(', ') : bed.status === 'MAINTENANCE' ? 'Under maintenance' : 'Available'}</p>
        <details className="mt-2"><summary className="cursor-pointer text-sm text-primary">Edit bed</summary>
          <BedForm propertyId={propertyId} roomId={room.id} bed={bed} />
          {!bed.tenancies.length && <StatefulForm action={archiveBedAction.bind(null, propertyId, room.id, bed.id)} className="mt-2"><SubmitButton className={button}>Archive bed</SubmitButton></StatefulForm>}
        </details>
      </div>)}
      {room.beds.length < room.capacity && <details className="pt-3"><summary className="cursor-pointer text-sm text-primary">Add bed</summary><BedForm propertyId={propertyId} roomId={room.id} /></details>}
    </div>}
  </details>;
}

function BedForm({ propertyId, roomId, bed }: { propertyId: string; roomId: string; bed?: Bed }) {
  return <StatefulForm action={saveBedAction.bind(null, propertyId, roomId, bed?.id)} className="mt-3 space-y-2">
    <label className="block text-sm"><span className="mb-1 block">Bed name</span><input name="label" maxLength={40} required defaultValue={bed?.label} className={field} /></label>
    <label className="block text-sm"><span className="mb-1 block">Monthly rent</span><input name="monthlyRent" type="number" min="0.01" step="0.01" required defaultValue={bed?.monthlyRent.toString()} className={field} /></label>
    <label className="block text-sm"><span className="mb-1 block">Availability</span><select name="status" defaultValue={bed?.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'VACANT'} className={field}>
      <option value="VACANT">Available</option>{!bed?.tenancies.length && <option value="MAINTENANCE">Under maintenance</option>}
    </select></label>
    <SubmitButton className={button}>Save bed</SubmitButton>
  </StatefulForm>;
}
