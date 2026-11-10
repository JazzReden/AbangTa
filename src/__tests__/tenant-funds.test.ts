import { fundBalances, fundEntrySchema, fundMoney } from '@/lib/utils/tenant-funds';

test('an empty ledger has ordinary zero balances', () => {
  const result = fundBalances([]);
  expect(result.deposit.toFixed(2)).toBe('0.00');
  expect(result.advance.toFixed(2)).toBe('0.00');
  expect(result.advance.isNegative()).toBe(false);
});

test('deposit and advance amounts stay separate and exact to the centavo', () => {
  const result = fundBalances([
    { kind: 'DEPOSIT_RECEIVED', amount: '5000.01' }, { kind: 'DEPOSIT_REFUNDED', amount: '1000.00' },
    { kind: 'DEPOSIT_DEDUCTED', amount: '500.01' }, { kind: 'ADVANCE_RECEIVED', amount: '2000.25' },
    { kind: 'ADVANCE_REFUNDED', amount: '100.10' },
  ], '1000.05');
  expect(result.deposit.toFixed(2)).toBe('3500.00');
  expect(result.advance.toFixed(2)).toBe('900.10');
});

test.each([0, -1, Infinity, NaN, 0.001, 100000000])('rejects invalid ledger amount %s', amount => {
  expect(fundMoney.safeParse(amount).success).toBe(false);
});

test('deductions require a reason and cannot masquerade as another cash transaction', () => {
  const base = { kind: 'DEPOSIT_DEDUCTED', amount: 100, paymentDate: new Date(0), idempotencyKey: '11b7d880-4f60-4d1f-b608-67ed42f891bc' };
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: null }).success).toBe(false);
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: 'CASH', notes: 'Damage documented' }).success).toBe(false);
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: null, notes: 'Damage documented' }).success).toBe(true);
});

test('receipts and refunds require a real payment method, not advance allocation', () => {
  const base = { kind: 'ADVANCE_RECEIVED', amount: 100, paymentDate: new Date(0), idempotencyKey: '11b7d880-4f60-4d1f-b608-67ed42f891bc' };
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: null }).success).toBe(false);
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: 'ADVANCE' }).success).toBe(false);
  expect(fundEntrySchema.safeParse({ ...base, paymentMethod: 'CASH', paymentDate: new Date(Date.now() + 86400000) }).success).toBe(false);
});
