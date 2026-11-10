import Decimal from 'decimal.js';
import type { BillStatus } from '@prisma/client';

export function remainingBalance(
  totalAmount: Decimal | number | string,
  amountPaid: Decimal | number | string
): Decimal {
  const remaining = new Decimal(totalAmount).minus(new Decimal(amountPaid));
  return remaining.lessThan(0) ? new Decimal(0) : remaining.toDecimalPlaces(2);
}

export function billStatusFromAmounts(
  totalAmount: Decimal | number | string,
  amountPaid: Decimal | number | string,
  dueDate: Date,
  now = new Date()
): BillStatus {
  const total = new Decimal(totalAmount);
  const paid = new Decimal(amountPaid);

  if (paid.greaterThanOrEqualTo(total) && total.greaterThan(0)) return 'PAID';
  if (now > dueDate) return 'OVERDUE';
  if (paid.greaterThan(0) && paid.lessThan(total)) return 'PARTIALLY_PAID';
  return 'PENDING';
}

export function canAcceptPayment(
  paymentAmount: Decimal | number | string,
  outstanding: Decimal | number | string
): { ok: true } | { ok: false; message: string } {
  const amount = new Decimal(paymentAmount);
  const remaining = new Decimal(outstanding);

  if (!amount.isFinite() || amount.decimalPlaces() > 2 || amount.lessThanOrEqualTo(0)) {
    return { ok: false, message: 'Payment amount must be greater than zero' };
  }
  if (amount.greaterThan(remaining)) {
    return {
      ok: false,
      message: `Payment cannot exceed the remaining balance of ₱${remaining.toFixed(2)}`,
    };
  }
  return { ok: true };
}

export function statementTotal(
  items: Array<{ amount: Decimal | number | string; isIncluded: boolean }>
): Decimal {
  return items
    .reduce((sum, item) => {
      if (item.isIncluded) return sum;
      return sum.plus(new Decimal(item.amount));
    }, new Decimal(0))
    .toDecimalPlaces(2);
}

export function equalSplitAmount(
  totalCharge: Decimal | number | string,
  occupiedRooms: number
): Decimal {
  if (occupiedRooms <= 0) {
    throw new Error('Occupied rooms must be greater than 0 to split a shared utility');
  }
  return new Decimal(totalCharge).div(occupiedRooms).toDecimalPlaces(2);
}

export function displayUtilityAmount(item: {
  isIncluded: boolean;
  amount: Decimal | number | string;
}): string {
  if (item.isIncluded) return 'Included in Rent';
  const value = new Decimal(item.amount);
  const [int, dec] = value.toFixed(2).split('.');
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${formatted}.${dec}`;
}
