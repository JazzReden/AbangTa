import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { PageHeader } from '@/components/ui/PageHeader';
import { MaintenanceRequestCard } from '@/components/landlord/MaintenanceRequestCard';

export const metadata = { title: 'Repair Details' };

export default async function RepairDetailPage({ params }: { params: Promise<{ propertyId: string; requestId: string }> }) {
  const user = await requireLandlord();
  const { propertyId, requestId } = await params;
  const request = await prisma.maintenanceRequest.findFirst({
    where: { id: requestId, propertyId, property: { landlordId: user.id } },
    include: { property: { select: { name: true } }, room: { select: { roomNumber: true } }, createdBy: { select: { name: true } } },
  });
  if (!request) notFound();
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <PageHeader eyebrow={request.property.name} title="Repair details" description="Keep the tenant informed from first report to resolution."
      action={<a href="/landlord/action-center?filter=repairs" className="app-secondary-action">Back to open repairs</a>} />
    <MaintenanceRequestCard request={request} />
    <a href={`/landlord/properties/${propertyId}/maintenance`} className="mt-5 inline-flex min-h-12 items-center text-sm font-medium underline">All repairs at this property</a>
  </div>;
}
