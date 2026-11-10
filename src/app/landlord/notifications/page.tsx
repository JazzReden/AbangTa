import { Bell } from 'lucide-react';
import Link from 'next/link';
import { requireLandlord } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export const metadata = { title: 'Notifications' };

export default async function LandlordNotificationsPage() {
  const user = await requireLandlord();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const requests = await prisma.maintenanceRequest.findMany({
    where: { id: { in: notifications.filter(notification => notification.relatedEntityType === 'MaintenanceRequest').map(notification => notification.relatedEntityId).filter((id): id is string => Boolean(id)) }, property: { landlordId: user.id } },
    select: { id: true, propertyId: true },
  });
  const requestLinks = new Map(requests.map(request => [request.id, `/landlord/properties/${request.propertyId}/maintenance#request-${request.id}`]));
  const proofs = await prisma.paymentProof.findMany({
    where: { id: { in: notifications.filter(n => n.relatedEntityType === 'PaymentProof').flatMap(n => n.relatedEntityId ? [n.relatedEntityId] : []) }, bill: { property: { landlordId: user.id } } },
    select: { id: true, billId: true, bill: { select: { propertyId: true } } },
  });
  const proofLinks = new Map(proofs.map(proof => [proof.id, `/landlord/properties/${proof.bill.propertyId}/bills/${proof.billId}#proof-${proof.id}`]));

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Updates</p>
        <h1 className="text-2xl font-bold">Notifications</h1>
      </div>

      {notifications.length === 0 ? (
        <div className="card-abangta rounded-3xl p-8 text-center">
          <Bell size={34} className="mx-auto mb-3 text-primary" />
          <h2 className="font-semibold">No notifications yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Billing, maintenance, and tenant activity will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <article key={notification.id} className="card-abangta rounded-3xl p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Bell size={16} />
                </div>
                <div>
                  <p className="font-semibold">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {notification.createdAt.toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  {notification.relatedEntityType === 'MaintenanceRequest' && notification.relatedEntityId && requestLinks.has(notification.relatedEntityId) &&
                    <Link href={requestLinks.get(notification.relatedEntityId)!} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">View request</Link>}
                  {notification.relatedEntityType === 'PaymentProof' && notification.relatedEntityId && proofLinks.has(notification.relatedEntityId) &&
                    <Link href={proofLinks.get(notification.relatedEntityId)!} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Review GCash proof</Link>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
