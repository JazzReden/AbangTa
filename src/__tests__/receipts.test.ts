import { PDFDocument } from 'pdf-lib';
import { paymentReceiptPdf } from '@/lib/pdf/payment-receipt';
import { hasDownloadableReceipt, type ReceiptSnapshot } from '@/lib/utils/receipt-data';
import { validJobAuthorization } from '@/lib/security/job-auth';

const snapshot: ReceiptSnapshot = {
  version: 1, number: 'AT-TEST-RECEIPT', tenantName: 'Jasper Dumasig', landlordName: 'Landlord', propertyName: 'Geo Dorm',
  propertyAddress: 'Cebu City', room: '101', periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-31T00:00:00.000Z',
  paymentDate: '2026-10-16T00:00:00.000Z', confirmedAt: '2026-10-16T04:00:00.000Z', method: 'CASH', reference: null,
  amount: '100.25', totalBilled: '1500.00', totalPaid: '100.25', balance: '1399.75',
};

test('only confirmed, non-voided Cash and GCash payments offer receipt downloads', () => {
  for (const paymentMethod of ['CASH', 'GCASH']) {
    expect(hasDownloadableReceipt({ paymentMethod })).toBe(false);
    expect(hasDownloadableReceipt({ paymentMethod, confirmedAt: new Date() })).toBe(true);
    expect(hasDownloadableReceipt({ paymentMethod, confirmedAt: new Date(), voidedAt: new Date() })).toBe(false);
  }
  expect(hasDownloadableReceipt({ paymentMethod: 'OTHER', confirmedAt: new Date() })).toBe(false);
});

test('receipts are readable PDFs and long/unicode text cannot break generation', async () => {
  const bytes = await paymentReceiptPdf(snapshot);
  expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  const long = await paymentReceiptPdf({ ...snapshot, tenantName: 'Niño ' + '\u4e2d'.repeat(80), propertyAddress: 'A'.repeat(1900) });
  expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThanOrEqual(1);
});

test('scheduled reminder endpoint requires a strong secret and exact bearer authorization', () => {
  const secret = 'test-secret-' + 'x'.repeat(32);
  expect(validJobAuthorization('Bearer ' + secret, secret)).toBe(true);
  for (const header of [null, secret, 'Bearer wrong', 'Bearer ' + secret + 'extra']) expect(validJobAuthorization(header, secret)).toBe(false);
  expect(validJobAuthorization('Bearer short', 'short')).toBe(false);
});
