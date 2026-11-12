import type { Prisma } from '@prisma/client';
import { Save } from 'lucide-react';
import { MaintenanceStatusBadge, PriorityBadge } from '@/components/ui/StatusBadge';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { updateMaintenanceAction } from '@/app/landlord/maintenance/actions';

type Request = Prisma.MaintenanceRequestGetPayload<{ include: { room: { select: { roomNumber: true } }; createdBy: { select: { name: true } } } }>;
const statuses = [
  { value: 'SUBMITTED', label: 'Submitted' }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
];
export function MaintenanceRequestCard({ request }: { request: Request }) {
  const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
  return <article id={'request-' + request.id} className="card-abangta scroll-mt-6 rounded-3xl p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{request.title}</h3><MaintenanceStatusBadge status={request.status} /></div>
          <p className="mb-3 break-words text-sm text-muted-foreground">Room {request.room.roomNumber} / {request.createdBy.name}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{request.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2"><PriorityBadge priority={request.priority} /><span className="text-xs text-muted-foreground">{request.category.replaceAll('_', ' ')} / {date.format(request.createdAt)}</span></div>
          {request.statusNotes && <div className="mt-4 border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Landlord note</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{request.statusNotes}</p></div>}
        </div>
        <StatefulForm action={updateMaintenanceAction.bind(null, request.id)} preserveValues className="space-y-3 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <label className="block text-sm font-medium">Status<select name="status" defaultValue={request.status} required className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm">{statuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="block text-sm font-medium">Note to tenant (optional)<textarea name="statusNotes" defaultValue={request.statusNotes ?? ''} rows={3} maxLength={1000} className="mt-1 block w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm" /></label>
          <SubmitButton className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Save size={16} /> Save update</SubmitButton>
        </StatefulForm>
      </div>
    </article>;
}
