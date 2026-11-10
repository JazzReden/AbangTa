import { createHash } from 'node:crypto';

export function normalizeGCashNumber(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (!/^(?:\+?63|0)?9\d{9}$/.test(compact)) throw new Error('Enter a valid Philippine GCash mobile number');
  return '+63' + compact.replace(/^(?:\+?63|0)/, '');
}

export function gcashReferenceKey(landlordId: string, reference: string) {
  const canonical = reference.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{3,99}$/.test(canonical)) throw new Error('Enter the GCash transaction reference from your transaction history');
  return createHash('sha256').update(JSON.stringify([landlordId, 'GCASH', canonical])).digest('hex');
}
