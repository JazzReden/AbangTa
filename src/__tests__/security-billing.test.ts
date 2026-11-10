import { allocateRoomCharge } from '@/lib/utils/allocation';
import { invitationToken, tokenDigest } from '@/lib/security/tokens';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { generateBillSchema, inviteTenantSchema } from '@/lib/validations';
import { canAcceptPayment, billStatusFromAmounts } from '@/lib/utils/billing';
import Decimal from 'decimal.js';
import { formatBillingPeriod, formatDateInput, getBillingPeriod } from '@/lib/utils/dates';

test('shared utility allocations conserve every centavo across rooms and occupants', () => {
  const tenants = [{ id: 'a', roomId: '1' }, { id: 'b', roomId: '1' }, { id: 'c', roomId: '2' }, { id: 'd', roomId: '3' }];
  const shares = allocateRoomCharge('1000.00', tenants);
  expect(shares.reduce((sum, s) => sum.plus(s.amount), new Decimal(0)).toFixed(2)).toBe('1000.00');
  expect(shares.find(s => s.id === 'a')?.amount.toFixed(2)).toBe('166.67');
  expect(shares.find(s => s.id === 'b')?.amount.toFixed(2)).toBe('166.67');
  expect(allocateRoomCharge('1000.00', [...tenants].reverse())).toEqual(shares);
  expect(() => allocateRoomCharge('NaN', tenants)).toThrow();
  expect(() => allocateRoomCharge('-1', tenants)).toThrow();
  expect(() => allocateRoomCharge('1', [])).toThrow();
});

test('invitation links are unpredictable and only digests are stored', () => {
  const a = invitationToken(), b = invitationToken();
  expect(a.token).not.toBe(b.token);
  expect(a.digest).not.toBe(a.token);
  expect(tokenDigest(a.token)).toBe(a.digest);
  expect(() => tokenDigest('old-cuid-invitation')).toThrow();
});

test('a Philippine due date stays current until the end of the chosen day', () => {
  const due = philippineDate('2026-10-15', true);
  expect(due.toISOString()).toBe('2026-10-15T15:59:59.999Z');
  expect(billStatusFromAmounts(100, 50, due, new Date('2026-10-15T12:00:00Z'))).toBe('PARTIALLY_PAID');
  expect(billStatusFromAmounts(100, 50, due, new Date('2026-10-15T16:00:00Z'))).toBe('OVERDUE');
  expect(() => philippineDate('2026-02-30')).toThrow();
  expect(formatBillingPeriod(philippineDate('2026-10-01'))).toBe('October 2026');
  expect(formatDateInput(getBillingPeriod(2026, 10).end)).toBe('2026-10-31');
});

test('invalid dates and non-finite/sub-cent payments are rejected', () => {
  expect(generateBillSchema.safeParse({
    tenancyId: 'x', billingPeriodStart: 'not-a-date', billingPeriodEnd: '2026-10-31', dueDate: '2026-10-15',
  }).success).toBe(false);
  expect(inviteTenantSchema.safeParse({ name: 'Tenant', email: 't@example.com', roomId: 'x', startDate: '2026-02-30', monthlyRent: 100 }).success).toBe(false);
  expect(canAcceptPayment('NaN', 100).ok).toBe(false);
  expect(canAcceptPayment('Infinity', 100).ok).toBe(false);
  expect(canAcceptPayment('0.001', 100).ok).toBe(false);
});
