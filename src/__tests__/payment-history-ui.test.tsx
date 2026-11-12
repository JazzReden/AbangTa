import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PaymentsPage from '@/app/tenant/payments/page';
import { PaymentService } from '@/services/billing/payment.service';

jest.mock('@/lib/auth/session', () => ({ requireTenant: jest.fn().mockResolvedValue({ id: 'tenant' }) }));
jest.mock('@/lib/db/prisma', () => ({ prisma: { tenancy: { findMany: jest.fn().mockResolvedValue([]) } } }));
jest.mock('@/services/billing/payment.service', () => ({ PaymentService: { getTenantPayments: jest.fn() } }));
jest.mock('@/services/billing/tenant-funds.service', () => ({ TenantFundsService: { getSummary: jest.fn() } }));

// The repository Jest transform uses classic JSX for server components.
Object.assign(globalThis, { React });

const getPayments = jest.mocked(PaymentService.getTenantPayments);
function history() {
  return { page: 1, pages: 2, pageSize: 20, total: 21, payments: [{
    id: 'fixture', amount: '100.25', paymentDate: new Date('2026-10-01'), paymentMethod: 'CASH',
    confirmedAt: new Date('2026-10-01'), voidedAt: null, voidReason: null,
    bill: { billingPeriodStart: new Date('2026-10-01'), property: { name: 'Test property' } },
  }] };
}
async function html(page?: string | string[]) {
  return renderToStaticMarkup(await PaymentsPage({ searchParams: Promise.resolve({ page }) }));
}
beforeEach(() => getPayments.mockResolvedValue(history() as unknown as Awaited<ReturnType<typeof PaymentService.getTenantPayments>>));

test('confirmed history shows billing context, receipt and forward pagination', async () => {
  const output = await html();
  for (const text of ['Payment history', '100.25', 'Confirmed', 'Test property', 'Receipt', 'Next payments', 'Page 1 of 2']) expect(output).toContain(text);
  expect(output).not.toContain('Previous payments');
});

test('reversed history explains the correction and never offers an invalid receipt', async () => {
  const data = history();
  Object.assign(data.payments[0], { voidedAt: new Date('2026-10-02'), voidReason: '<script>bad</script>' });
  getPayments.mockResolvedValue(data as unknown as Awaited<ReturnType<typeof PaymentService.getTenantPayments>>);
  const output = await html();
  expect(output).toContain('Reversed'); expect(output).toContain('does not transfer or refund money');
  expect(output).toContain('&lt;script&gt;bad&lt;/script&gt;'); expect(output).not.toContain('<script>');
  expect(output).not.toContain('Receipt');
});

test('empty history guides users to bills and malformed query parameters use the first page', async () => {
  getPayments.mockResolvedValue({ payments: [], total: 0, page: 1, pages: 1, pageSize: 20 });
  for (const page of ['-1', 'garbage', ['2', '3']]) {
    const output = await html(page);
    expect(getPayments).toHaveBeenLastCalledWith('tenant', 1);
    expect(output).toContain('No payments recorded yet'); expect(output).toContain('View payment instructions');
    expect(output).not.toContain('Next payments');
  }
});
