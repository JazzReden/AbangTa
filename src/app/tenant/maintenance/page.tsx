import { PageHeader } from '@/components/ui/PageHeader';
import { requireTenant } from '@/lib/auth/session';
import { MaintenanceListService } from '@/services/maintenance/maintenance-list.service';
import { ListControls, ListPagination, MAINTENANCE_FILTERS } from '@/components/ui/ListControls';
import type { ListQuery } from '@/lib/lists/query';
import { MaintenanceStatusBadge, PriorityBadge } from '@/components/ui/StatusBadge';
import TenantMaintenanceForm from './TenantMaintenanceForm';
import { Wrench } from 'lucide-react';
import { TenantService } from '@/services/tenants/tenant.service';
import Link from 'next/link';

export const metadata = { title: 'Maintenance' };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default async function TenantMaintenancePage({ searchParams }: { searchParams: Promise<ListQuery> }) {
  const user = await requireTenant();
  const result = await MaintenanceListService.forTenant(user.id, await searchParams);
  const requests = result.records;
  const tenancy = await TenantService.getActiveTenancy(user.id);

  return (
    <main className="mx-auto max-w-3xl p-4 pb-24 md:p-6">
      <PageHeader eyebrow="Your home" title="Maintenance" description="Report a repair and follow its progress." />

      {/* Submit form */}
      <div className="card-abangta rounded-3xl p-5 mb-6">
        <h2 className="font-semibold mb-4">New request</h2>
        {tenancy ? <TenantMaintenanceForm /> : <Link href="/tenant/join" className="inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">Join a room to submit a request</Link>}
      </div>

      {/* Request list */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Your requests</p>
      </div>

      <ListControls path="/tenant/maintenance" query={result.query} statuses={MAINTENANCE_FILTERS} searchLabel="Search requests or room" priorities />
      <p className="mb-4 text-sm text-muted-foreground">{result.total} matching {result.total === 1 ? 'record' : 'records'}</p>
      {requests.length === 0 ? (
        <div className="card-abangta rounded-3xl p-8 text-center">
          <Wrench size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No matching requests. Try another search or clear the filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <article key={req.id} className="card-abangta rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold">{req.title}</h3>
                <MaintenanceStatusBadge status={req.status} />
              </div>
              <p className="text-sm text-muted-foreground mb-3">{req.description}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityBadge priority={req.priority} />
                <span className="text-xs text-muted-foreground">
                  {req.category} · {formatDate(req.createdAt)}
                </span>
              </div>
              {req.statusNotes && (
                <div className="mt-3 rounded-xl bg-muted px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">
                    Landlord note
                  </p>
                  <p className="text-sm">{req.statusNotes}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <ListPagination path="/tenant/maintenance" query={result.query} result={result} />
    </main>
  );
}
