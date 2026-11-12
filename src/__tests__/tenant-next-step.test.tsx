import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tenantNextStep } from '@/lib/billing/tenant-next-step';
import { TenantNextStep } from '@/components/tenant/TenantNextStep';
import { DailyBrief } from '@/components/landlord/DailyBrief';

const bill = (id: string, status?: 'PENDING' | 'APPROVED' | 'REJECTED', date = '2026-01-01') => ({ id, dueDate: new Date(date), paymentProofs: status ? [{ status }] : [] });

test('prioritizes an actionable unpaid bill before one already awaiting verification', () => {
  const result = tenantNextStep([bill('old-pending', 'PENDING'), bill('new-due', undefined, '2026-02-01')]);
  expect(result).toMatchObject({ billId: 'new-due', status: 'PAYMENT_DUE' });
});
test('rejected and reversed/partial approved proofs lead back to their unpaid bill', () => {
  expect(tenantNextStep([bill('rejected', 'REJECTED')])?.status).toBe('PROOF_REJECTED');
  expect(tenantNextStep([bill('partial', 'APPROVED')])?.status).toBe('PAYMENT_DUE');
});
test('pending-only bills never become paid and empty accounts have no next bill', () => {
  expect(tenantNextStep([bill('pending', 'PENDING')])?.status).toBe('AWAITING_REVIEW');
  expect(tenantNextStep([])).toBeNull();
});
test('equal due dates use stable IDs without mutating input', () => {
  const bills = [bill('b'), bill('a')];
  expect(tenantNextStep(bills)?.billId).toBe('a');
  expect(bills.map(row => row.id)).toEqual(['b', 'a']);
});
test('tenant pending guidance prevents duplicate transfers and links the exact bill', () => {
  const html = renderToStaticMarkup(<TenantNextStep step={tenantNextStep([bill('older bill', 'PENDING')])} />);
  expect(html).toContain('/tenant/bills?bill=older%20bill');
  expect(html).toContain('before paying this bill again');
  expect(html).toContain('View submitted proof');
  expect(html).not.toContain('No unpaid bills');
});
test('daily brief puts urgent repairs first and describes the limits of an empty queue', () => {
  const html = renderToStaticMarkup(<DailyBrief summary={{ proofs: 2, overdue: 3, repairs: 4, urgent: 1 }} />);
  expect(html).toContain('1 urgent repair needs attention');
  expect(html).toContain('filter=repairs&amp;priority=URGENT');
  const empty = renderToStaticMarkup(<DailyBrief summary={{ proofs: 0, overdue: 0, repairs: 0, urgent: 0 }} />);
  expect(empty).toContain('Your action queues are clear');
  expect(empty).toContain('No pending GCash proofs, overdue balances, or open repairs');
});
