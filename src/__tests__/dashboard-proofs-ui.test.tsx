import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Prisma } from '@prisma/client';
import { PendingGCashProofs } from '@/components/billing/PendingGCashProofs';

type Queue = React.ComponentProps<typeof PendingGCashProofs>['queue'];
function queue(): Queue {
  return { total: 1, page: 1, pages: 1, proofs: [{ id: 'proof-fixture', amount: new Prisma.Decimal('100.25'), createdAt: new Date('2026-10-16T18:00:00Z'), billId: 'bill-fixture', bill: { propertyId: 'property-fixture', status: 'PENDING', cancelledAt: null, property: { name: 'Geo Dorm' }, tenancy: { tenant: { name: 'Fixture Tenant' }, room: { roomNumber: '101' }, bed: { label: 'Bed A' } } } }] };
}

test('dashboard queue shows essential details with an anchored review link, not blind confirmation', () => {
  const html = renderToStaticMarkup(<PendingGCashProofs queue={queue()} />);
  for (const text of ['GCash proofs awaiting review', '1 pending', 'Fixture Tenant', 'Geo Dorm / Room 101 / Bed A', '100.25', 'Submitted amount', 'Oct 17, 2026', 'Review proof']) expect(html).toContain(text);
  expect(html).toContain('/landlord/properties/property-fixture/bills/bill-fixture#proof-proof-fixture');
  expect(html).not.toContain('<form'); expect(html).not.toContain('Confirm GCash payment');
  expect(html).not.toContain('Next proofs'); expect(html).not.toContain('Previous proofs');
});

test('empty state stays compact and does not show a misleading review action', () => {
  const html = renderToStaticMarkup(<PendingGCashProofs queue={{ total: 0, page: 1, pages: 1, proofs: [] }} />);
  expect(html).toContain('0 pending'); expect(html).toContain('No GCash proofs awaiting review.');
  expect(html).not.toContain('Review proof');
});

test('pagination preserves queue anchor and only offers valid directions', () => {
  const data = queue(); data.total = 12; data.pages = 3;
  let html = renderToStaticMarkup(<PendingGCashProofs queue={data} />);
  expect(html).toContain('?proofPage=2#pending-gcash-proofs'); expect(html).not.toContain('Previous proofs');
  data.page = 2; html = renderToStaticMarkup(<PendingGCashProofs queue={data} />);
  expect(html).toContain('?proofPage=1#pending-gcash-proofs'); expect(html).toContain('?proofPage=3#pending-gcash-proofs');
  data.page = 3; html = renderToStaticMarkup(<PendingGCashProofs queue={data} />);
  expect(html).not.toContain('Next proofs');
});

test('unresolved proofs on settled or cancelled bills have a warning without changing status or money', () => {
  const data = queue(); data.proofs[0].bill.status = 'PAID';
  expect(renderToStaticMarkup(<PendingGCashProofs queue={data} />)).toContain('Bill already paid - check for duplicate payment.');
  data.proofs[0].bill.cancelledAt = new Date();
  expect(renderToStaticMarkup(<PendingGCashProofs queue={data} />)).toContain('Bill cancelled - proof still needs review.');
});

test('user-provided labels are escaped and flexible rows support narrow screens', () => {
  const data = queue(); data.proofs[0].bill.tenancy.tenant.name = '<script>alert(1)</script>';
  const html = renderToStaticMarkup(<PendingGCashProofs queue={data} />);
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  expect(html).toContain('sm:flex-row'); expect(html).toContain('min-w-0'); expect(html).toContain('break-words');
});
