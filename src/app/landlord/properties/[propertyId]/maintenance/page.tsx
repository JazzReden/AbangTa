import { MaintenanceRequestCard } from '@/components/landlord/MaintenanceRequestCard';
import { notFound } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { MaintenanceListService } from '@/services/maintenance/maintenance-list.service';
import { ListControls, ListPagination, MAINTENANCE_FILTERS } from '@/components/ui/ListControls';
import type { ListQuery } from '@/lib/lists/query';
import { PropertyNav } from '@/components/landlord/PropertyNav';

export const metadata = { title: 'Maintenance' };


export default async function PropertyMaintenancePage({ params, searchParams }: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<ListQuery>;
}) {
  const { propertyId } = await params;
  const user = await requireLandlord();
  const property = await PropertyService.getOwnedSummary(propertyId, user.id);
  if (!property) notFound();
  const result = await MaintenanceListService.forProperty(propertyId, user.id, await searchParams);
  const requests = result.records;
  const path = `/landlord/properties/${propertyId}/maintenance`;
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <h1 className="mb-2 text-2xl font-bold">{property.name}</h1>
    <PropertyNav propertyId={propertyId} current="maintenance" />
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Maintenance requests <span className="text-sm font-normal text-muted-foreground">({result.total})</span></h2>
    </header>
    <ListControls path={path} query={result.query} statuses={MAINTENANCE_FILTERS} searchLabel="Search request, tenant or room" priorities />
    <p className="mb-4 text-sm text-muted-foreground">{result.total} matching {result.total === 1 ? 'record' : 'records'}</p>
    {!requests.length ? <div className="card-abangta rounded-3xl p-8 text-center">
      <Wrench size={32} className="mx-auto mb-3 text-primary" />
      <h3 className="font-semibold">No matching requests</h3><p className="mt-2 text-sm text-muted-foreground">Try another search or clear the filters above.</p>
    </div> : <div className="space-y-4">{requests.map(request => <MaintenanceRequestCard key={request.id} request={request} />)}</div>}
    <ListPagination path={path} query={result.query} result={result} />
  </div>;
}
