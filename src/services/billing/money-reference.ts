import type { Prisma } from '@prisma/client';
import { gcashReferenceKey } from '@/lib/utils/payment-details';

export async function reserveGCashReference(tx: Prisma.TransactionClient, landlordId: string, referenceNumber: string) {
  const key = gcashReferenceKey(landlordId, referenceNumber);
  // Also protect older payments recorded before reference keys were introduced.
  if (await tx.payment.findFirst({ where: { recordedById: landlordId, paymentMethod: 'GCASH', referenceNumber } })) throw new Error('This GCash reference has already been recorded');
  await tx.moneyReference.create({ data: { key, ownerId: landlordId } });
  return key;
}
