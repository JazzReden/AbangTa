import { z } from 'zod';

const amount = z.string().regex(/^\d{1,8}\.\d{2}$/);
export const receiptSnapshotSchema = z.object({
  version: z.literal(1), number: z.string().regex(/^AT-[A-Z0-9_-]{1,64}$/),
  tenantName: z.string().max(500), landlordName: z.string().max(500),
  propertyName: z.string().max(500), propertyAddress: z.string().max(2000), room: z.string().max(100),
  periodStart: z.string().datetime(), periodEnd: z.string().datetime(),
  paymentDate: z.string().datetime(), confirmedAt: z.string().datetime(),
  method: z.enum(['CASH', 'GCASH']), reference: z.string().max(100).nullable(),
  amount, totalBilled: amount, totalPaid: amount, balance: amount,
});
export type ReceiptSnapshot = z.infer<typeof receiptSnapshotSchema>;

export function hasDownloadableReceipt(payment: { paymentMethod: string; confirmedAt?: Date | string | null; voidedAt?: Date | string | null }) {
  return Boolean(payment.confirmedAt && !payment.voidedAt && ['CASH', 'GCASH'].includes(payment.paymentMethod));
}
