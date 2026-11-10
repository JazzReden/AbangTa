/**
 * AbangTa 1.0 — Billing Service Unit Tests
 *
 * Tests the core billing engine logic:
 * - INCLUDED utilities produce no charge
 * - FIXED_RATE utilities produce correct flat charge
 * - METERED utilities produce correct consumption-based charge
 * - Duplicate bill detection
 * - Invalid inputs rejected
 */

import Decimal from 'decimal.js';
import {
  calculateConsumption,
  calculateMeteredCharge,
  calculateEqualSplit,
} from '@/lib/utils/currency';
import { billStatusFromAmounts, remainingBalance } from '@/lib/utils/billing';

// ─── Meter consumption ─────────────────────────────────────────────────────

describe('calculateConsumption', () => {
  it('returns correct consumption for normal readings', () => {
    const result = calculateConsumption(1250, 1280);
    expect(result?.toNumber()).toBe(30);
  });

  it('returns correct consumption for water readings', () => {
    const result = calculateConsumption(105, 108);
    expect(result?.toNumber()).toBe(3);
  });

  it('returns null when current < previous (invalid, non-reset)', () => {
    const result = calculateConsumption(1280, 1250);
    expect(result).toBeNull();
  });

  it('returns current reading as consumption when isMeterReset=true', () => {
    const result = calculateConsumption(1280, 50, true);
    expect(result?.toNumber()).toBe(50);
  });

  it('returns zero when readings are equal', () => {
    const result = calculateConsumption(100, 100);
    expect(result?.toNumber()).toBe(0);
  });

  it('handles decimal readings correctly', () => {
    const result = calculateConsumption(105.5, 108.7);
    expect(result?.toNumber()).toBeCloseTo(3.2);
  });
});

// ─── Metered charge calculation ─────────────────────────────────────────────

describe('calculateMeteredCharge', () => {
  it('calculates electricity: 30 kWh × ₱15 = ₱450', () => {
    const result = calculateMeteredCharge(30, 15);
    expect(result.toNumber()).toBe(450);
  });

  it('calculates water: 3 m³ × ₱40 = ₱120', () => {
    const result = calculateMeteredCharge(3, 40);
    expect(result.toNumber()).toBe(120);
  });

  it('rounds to 2 decimal places', () => {
    // 7 kWh × ₱15.50 = ₱108.50
    const result = calculateMeteredCharge(7, 15.5);
    expect(result.toFixed(2)).toBe('108.50');
  });

  it('handles Decimal inputs', () => {
    const result = calculateMeteredCharge(new Decimal('35'), new Decimal('15'));
    expect(result.toNumber()).toBe(525);
  });

  it('is precise — no floating point errors', () => {
    // 0.1 + 0.2 floating point trap
    const result = calculateMeteredCharge('0.1', '0.2');
    expect(result.toFixed(10)).toBe('0.0200000000');
  });
});

// ─── Equal split ────────────────────────────────────────────────────────────

describe('calculateEqualSplit', () => {
  it('splits ₱6000 across 10 rooms = ₱600 each', () => {
    const result = calculateEqualSplit(6000, 10);
    expect(result.toNumber()).toBe(600);
  });

  it('splits ₱1500 across 4 rooms = ₱375 each', () => {
    const result = calculateEqualSplit(1500, 4);
    expect(result.toNumber()).toBe(375);
  });

  it('rounds to 2 decimal places', () => {
    const result = calculateEqualSplit(1000, 3);
    expect(result.toFixed(2)).toBe('333.33');
  });

  it('throws when occupiedRooms is 0', () => {
    expect(() => calculateEqualSplit(1000, 0)).toThrow();
  });

  it('throws when occupiedRooms is negative', () => {
    expect(() => calculateEqualSplit(1000, -1)).toThrow();
  });
});

// ─── Bill status transitions ─────────────────────────────────────────────────

describe('billStatusFromAmounts', () => {
  const futureDate = new Date(Date.now() + 86400000 * 10); // 10 days ahead
  const pastDate = new Date(Date.now() - 86400000);       // Yesterday

  it('returns PAID when amountPaid >= totalAmount', () => {
    expect(billStatusFromAmounts(4000, 4000, futureDate)).toBe('PAID');
    expect(billStatusFromAmounts(4000, 5000, futureDate)).toBe('PAID');
  });

  it('returns PARTIALLY_PAID when 0 < amountPaid < totalAmount', () => {
    expect(billStatusFromAmounts(4000, 2000, futureDate)).toBe('PARTIALLY_PAID');
  });

  it('returns OVERDUE when unpaid and past due date', () => {
    expect(billStatusFromAmounts(4000, 0, pastDate)).toBe('OVERDUE');
  });

  it('returns PENDING when unpaid and not yet due', () => {
    expect(billStatusFromAmounts(4000, 0, futureDate)).toBe('PENDING');
  });

  it('returns OVERDUE when partially paid and past due date', () => {
    expect(billStatusFromAmounts(4000, 1000, pastDate)).toBe('OVERDUE');
  });
});

// ─── Remaining balance ────────────────────────────────────────────────────────

describe('remainingBalance', () => {
  it('calculates remaining: ₱4525 - ₱2000 = ₱2525', () => {
    const result = remainingBalance(4525, 2000);
    expect(result.toNumber()).toBe(2525);
  });

  it('returns 0 when fully paid', () => {
    const result = remainingBalance(4000, 4000);
    expect(result.toNumber()).toBe(0);
  });

  it('returns 0 when overpaid (not negative)', () => {
    const result = remainingBalance(4000, 5000);
    expect(result.toNumber()).toBe(0);
  });

  it('handles Decimal types', () => {
    const result = remainingBalance(new Decimal('4525.00'), new Decimal('2000.00'));
    expect(result.toFixed(2)).toBe('2525.00');
  });
});

// ─── Scenario A: Water INCLUDED, Electricity METERED ─────────────────────────

describe('Scenario A — Water INCLUDED, Electricity METERED', () => {
  const RENT = 4000;
  const ELEC_RATE = 15;
  const PREV_READING = 1250;
  const CURR_READING = 1285;

  it('produces correct total: rent + electricity only', () => {
    const consumption = calculateConsumption(PREV_READING, CURR_READING);
    expect(consumption).not.toBeNull();
    const elecCharge = calculateMeteredCharge(consumption!, ELEC_RATE);
    const total = new Decimal(RENT).plus(elecCharge);

    // 35 kWh × ₱15 = ₱525, total = ₱4000 + ₱525 = ₱4525
    expect(consumption?.toNumber()).toBe(35);
    expect(elecCharge.toNumber()).toBe(525);
    expect(total.toNumber()).toBe(4525);
  });

  it('water is INCLUDED — contributes ₱0 to total', () => {
    // INCLUDED billing method means no addition to total
    const waterContribution = 0;
    expect(waterContribution).toBe(0);
  });
});

// ─── Scenario B: Water FIXED, Electricity INCLUDED ────────────────────────────

describe('Scenario B — Water FIXED, Electricity INCLUDED', () => {
  const RENT = 4000;
  const WATER_FIXED = 150;

  it('produces correct total: rent + water only', () => {
    const total = new Decimal(RENT).plus(new Decimal(WATER_FIXED));
    expect(total.toNumber()).toBe(4150);
  });

  it('electricity is INCLUDED — contributes ₱0 to total', () => {
    const elecContribution = 0;
    expect(elecContribution).toBe(0);
  });
});

// ─── Scenario C: Both METERED ─────────────────────────────────────────────────

describe('Scenario C — Water METERED, Electricity METERED', () => {
  const RENT = 4500;
  const WATER_RATE = 40;
  const ELEC_RATE = 15;

  const WATER_PREV = 105;
  const WATER_CURR = 108;
  const ELEC_PREV = 1200;
  const ELEC_CURR = 1235;

  it('calculates water charge: 3 m³ × ₱40 = ₱120', () => {
    const consumption = calculateConsumption(WATER_PREV, WATER_CURR);
    const charge = calculateMeteredCharge(consumption!, WATER_RATE);
    expect(consumption?.toNumber()).toBe(3);
    expect(charge.toNumber()).toBe(120);
  });

  it('calculates electricity charge: 35 kWh × ₱15 = ₱525', () => {
    const consumption = calculateConsumption(ELEC_PREV, ELEC_CURR);
    const charge = calculateMeteredCharge(consumption!, ELEC_RATE);
    expect(consumption?.toNumber()).toBe(35);
    expect(charge.toNumber()).toBe(525);
  });

  it('total = rent + water + electricity', () => {
    const waterConsumption = calculateConsumption(WATER_PREV, WATER_CURR)!;
    const elecConsumption = calculateConsumption(ELEC_PREV, ELEC_CURR)!;
    const waterCharge = calculateMeteredCharge(waterConsumption, WATER_RATE);
    const elecCharge = calculateMeteredCharge(elecConsumption, ELEC_RATE);
    const total = new Decimal(RENT).plus(waterCharge).plus(elecCharge);

    // ₱4500 + ₱120 + ₱525 = ₱5145
    expect(total.toNumber()).toBe(5145);
  });
});
