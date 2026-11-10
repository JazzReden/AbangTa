/**
 * AbangTa 1.0 — Payment Logic Unit Tests
 *
 * Tests payment validation rules:
 * - Full payment
 * - Partial payment
 * - Overpayment prevention
 * - Multiple payments
 * - Bill status after each payment
 */

import Decimal from 'decimal.js';
import { billStatusFromAmounts, remainingBalance, canAcceptPayment } from '@/lib/utils/billing';

describe('Payment — full payment', () => {
  it('marks bill as PAID when payment equals total', () => {
    const status = billStatusFromAmounts(4000, 4000, new Date(Date.now() + 86400000 * 5));
    expect(status).toBe('PAID');
  });

  it('remaining balance is ₱0 after full payment', () => {
    const balance = remainingBalance(4000, 4000);
    expect(balance.toNumber()).toBe(0);
  });
});

describe('Payment — partial payment', () => {
  it('marks bill as PARTIALLY_PAID', () => {
    const status = billStatusFromAmounts(4000, 2000, new Date(Date.now() + 86400000 * 5));
    expect(status).toBe('PARTIALLY_PAID');
  });

  it('computes correct remaining balance', () => {
    const balance = remainingBalance(4000, 2000);
    expect(balance.toNumber()).toBe(2000);
  });
});

describe('Payment — multiple payments', () => {
  it('accumulates correctly across multiple partial payments', () => {
    // Simulate 3 payments: 1000 + 1500 + 1525 = 4025 against ₱4525 bill
    const totalBill = new Decimal(4525);
    const payments = [1000, 1500, 1525];
    const totalPaid = payments.reduce((sum, p) => sum.plus(p), new Decimal(0));

    expect(totalPaid.toNumber()).toBe(4025);
    const remaining = totalBill.minus(totalPaid);
    expect(remaining.toNumber()).toBe(500);

    const status = billStatusFromAmounts(4525, 4025, new Date(Date.now() + 86400000 * 5));
    expect(status).toBe('PARTIALLY_PAID');
  });

  it('marks as PAID after final payment closes the balance', () => {
    const totalBill = 4525;
    const paid = 4025;
    const finalPayment = 500;
    const newPaid = paid + finalPayment;

    const status = billStatusFromAmounts(totalBill, newPaid, new Date(Date.now() + 86400000));
    expect(status).toBe('PAID');
    expect(remainingBalance(totalBill, newPaid).toNumber()).toBe(0);
  });
});

describe('Payment — overpayment prevention', () => {
  it('rejects payment that exceeds remaining balance', () => {
    const result = canAcceptPayment(3000, 2000); // Try to pay ₱3000 on ₱2000 remaining
    expect(result.ok).toBe(false);
  });

  it('accepts payment equal to remaining balance', () => {
    const result = canAcceptPayment(2000, 2000);
    expect(result.ok).toBe(true);
  });

  it('accepts payment less than remaining balance', () => {
    const result = canAcceptPayment(1000, 2000);
    expect(result.ok).toBe(true);
  });

  it('rejects payment of zero', () => {
    const result = canAcceptPayment(0, 2000);
    expect(result.ok).toBe(false);
  });

  it('rejects negative payment', () => {
    const result = canAcceptPayment(-100, 2000);
    expect(result.ok).toBe(false);
  });
});

describe('Payment — overdue status', () => {
  it('marks unpaid bill as OVERDUE after due date', () => {
    const pastDate = new Date(Date.now() - 86400000); // Yesterday
    const status = billStatusFromAmounts(4000, 0, pastDate);
    expect(status).toBe('OVERDUE');
  });

  it('does not mark OVERDUE if payment was made', () => {
    const pastDate = new Date(Date.now() - 86400000);
    const status = billStatusFromAmounts(4000, 4000, pastDate);
    expect(status).toBe('PAID');
  });
});
