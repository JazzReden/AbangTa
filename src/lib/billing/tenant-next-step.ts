import type { PaymentProofStatus } from '@prisma/client';

export type TenantNextStep = { billId: string; dueDate: Date; status: 'PAYMENT_DUE' | 'AWAITING_REVIEW' | 'PROOF_REJECTED' };

/** Pending proof never means paid. Prefer an unpaid bill the tenant can act on. */
export function tenantNextStep(bills: { id: string; dueDate: Date; paymentProofs: { status: PaymentProofStatus }[] }[]): TenantNextStep | null {
  const ordered = [...bills].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));
  const bill = ordered.find(item => item.paymentProofs[0]?.status !== 'PENDING') ?? ordered[0];
  if (!bill) return null;
  const status = bill.paymentProofs[0]?.status;
  return { billId: bill.id, dueDate: bill.dueDate, status: status === 'PENDING' ? 'AWAITING_REVIEW' : status === 'REJECTED' ? 'PROOF_REJECTED' : 'PAYMENT_DUE' };
}
