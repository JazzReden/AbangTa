import { z } from 'zod';
import Decimal from 'decimal.js';

export const fundMoney = z.number().finite().positive().max(99999999.99).refine(value => new Decimal(value).decimalPlaces() <= 2, 'Use at most two decimal places');
export const fundKind = z.enum(['DEPOSIT_RECEIVED', 'DEPOSIT_REFUNDED', 'DEPOSIT_DEDUCTED', 'ADVANCE_RECEIVED', 'ADVANCE_REFUNDED']);
export const fundLabels = {
  DEPOSIT_RECEIVED: 'Deposit received', DEPOSIT_REFUNDED: 'Deposit refunded', DEPOSIT_DEDUCTED: 'Deposit deduction',
  ADVANCE_RECEIVED: 'Advance received', ADVANCE_REFUNDED: 'Advance refunded',
} as const;
export const fundEntrySchema = z.object({
  kind: fundKind, amount: fundMoney, paymentDate: z.date().refine(date => date.getTime() <= Date.now(), 'Date cannot be in the future'),
  paymentMethod: z.enum(['CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER']).nullable(),
  referenceNumber: z.string().trim().max(100).transform(value => value.toUpperCase()).optional(),
  notes: z.string().trim().max(500).optional(), idempotencyKey: z.string().uuid(),
}).superRefine((input, ctx) => {
  if (input.kind === 'DEPOSIT_DEDUCTED') {
    if (!input.notes || input.notes.length < 3) ctx.addIssue({ code: 'custom', path: ['notes'], message: 'A deposit deduction needs a reason' });
    if (input.paymentMethod || input.referenceNumber) ctx.addIssue({ code: 'custom', message: 'A deposit deduction is not a new cash payment' });
  } else if (!input.paymentMethod) ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Choose a payment method' });
});

export function fundBalances(entries: Array<{ kind: keyof typeof fundLabels; amount: Decimal.Value }>, appliedAdvance: Decimal.Value = 0) {
  let deposit = new Decimal(0), advance = new Decimal(0).minus(appliedAdvance);
  for (const entry of entries) {
    const amount = new Decimal(entry.amount);
    if (!amount.isFinite() || amount.isNegative()) throw new Error('Invalid ledger amount');
    if (entry.kind === 'DEPOSIT_RECEIVED') deposit = deposit.plus(amount);
    else if (entry.kind.startsWith('DEPOSIT_')) deposit = deposit.minus(amount);
    else advance = entry.kind === 'ADVANCE_RECEIVED' ? advance.plus(amount) : advance.minus(amount);
  }
  return { deposit, advance };
}
