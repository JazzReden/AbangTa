import { additionalChargesSchema, parseAdditionalCharges } from '@/lib/utils/additional-charges';
import { gcashReferenceKey, normalizeGCashNumber } from '@/lib/utils/payment-details';
import { recordPaymentSchema, updateLandlordProfileSchema } from '@/lib/validations';

test('additional charges distinguish charged, included and free without guessing a fee', () => {
  expect(additionalChargesSchema.parse([
    { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 200.25 },
    { itemType: 'PARKING', description: 'Parking', treatment: 'FREE', amount: 0 },
    { itemType: 'OTHER', description: 'Laundry', treatment: 'INCLUDED', amount: 0 },
  ])).toHaveLength(3);
  expect(parseAdditionalCharges(null)).toEqual([]);
});

test('malformed, negative, duplicate and fractional-cent charges are rejected', () => {
  const row = { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 10 };
  for (const rows of [[row, row], [{ ...row, amount: -1 }], [{ ...row, amount: 0.001 }], [{ ...row, treatment: 'FREE' }], [{ ...row, amount: 0 }], Array(21).fill(row)]) {
    expect(additionalChargesSchema.safeParse(rows).success).toBe(false);
  }
  expect(() => parseAdditionalCharges('{bad')).toThrow('Invalid additional charges');
  expect(() => parseAdditionalCharges('x'.repeat(10001))).toThrow();
  expect(additionalChargesSchema.safeParse([{ ...row, itemType: 'OTHER', description: 'Rent' }]).success).toBe(false);
});

test('GCash payee details must be a complete valid pair', () => {
  expect(normalizeGCashNumber('0917 123 4567')).toBe('+639171234567');
  expect(updateLandlordProfileSchema.safeParse({ name: 'Landlord', gcashName: 'Payee' }).success).toBe(false);
  expect(updateLandlordProfileSchema.safeParse({ name: 'Landlord', gcashName: 'Payee', gcashNumber: 'invalid' }).success).toBe(false);
  expect(updateLandlordProfileSchema.parse({ name: 'Landlord', gcashName: 'Payee', gcashNumber: '09171234567' }).gcashNumber).toBe('+639171234567');
});

test('GCash requires a real reference entry; cash does not', () => {
  const input = { billId: 'bill', amount: 10, paymentDate: '2026-10-16', paymentMethod: 'GCASH' };
  expect(recordPaymentSchema.safeParse(input).success).toBe(false);
  expect(recordPaymentSchema.safeParse({ ...input, referenceNumber: '1234567890123' }).success).toBe(true);
  expect(recordPaymentSchema.safeParse({ ...input, paymentMethod: 'CASH' }).success).toBe(true);
  expect(gcashReferenceKey('owner', ' abc-1234 ')).toBe(gcashReferenceKey('owner', 'ABC-1234'));
  expect(gcashReferenceKey('other-owner', 'ABC-1234')).not.toBe(gcashReferenceKey('owner', 'ABC-1234'));
});
