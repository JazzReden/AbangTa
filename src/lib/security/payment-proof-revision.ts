import { createHash } from 'node:crypto';
import type { PaymentProofService } from '@/services/billing/payment-proof.service';

export function pendingProofRevision(landlordId: string, queue: Awaited<ReturnType<typeof PaymentProofService.getPendingForLandlord>>) {
  return createHash('sha256').update(JSON.stringify([landlordId, queue])).digest('hex');
}
