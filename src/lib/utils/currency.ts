import Decimal from 'decimal.js';

/**
 * Format a value as Philippine Peso.
 * Example: formatPeso(4525) => '₱4,525.00'
 */
export function formatPeso(amount: number | Decimal | string): string {
  const value = new Decimal(amount);
  const fixed = value.toFixed(2);
  const [int, dec] = fixed.split('.');
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${formatted}.${dec}`;
}

/**
 * Parse a peso string to Decimal.
 * Example: parsePeso('₱4,525.00') => Decimal('4525.00')
 */
export function parsePeso(value: string): Decimal {
  const cleaned = value.replace(/[₱,]/g, '');
  return new Decimal(cleaned);
}

/**
 * Calculate meter consumption safely.
 * Returns null if current < previous (and not a reset) — negative consumption is invalid.
 */
export function calculateConsumption(
  previous: Decimal | number | string,
  current: Decimal | number | string,
  isMeterReset = false
): Decimal | null {
  const prev = new Decimal(previous);
  const curr = new Decimal(current);

  if (!isMeterReset && curr.lessThan(prev)) {
    return null;
  }

  return isMeterReset ? curr : curr.minus(prev);
}

/**
 * Calculate a metered charge.
 * consumption × ratePerUnit, rounded to 2 decimal places.
 */
export function calculateMeteredCharge(
  consumption: Decimal | number | string,
  ratePerUnit: Decimal | number | string
): Decimal {
  return new Decimal(consumption)
    .mul(new Decimal(ratePerUnit))
    .toDecimalPlaces(2);
}

/**
 * Calculate an equal-split charge.
 * totalCharge ÷ occupiedRooms, rounded to 2 decimal places.
 */
export function calculateEqualSplit(
  totalCharge: Decimal | number | string,
  occupiedRooms: number
): Decimal {
  if (occupiedRooms <= 0)
    throw new Error('Occupied rooms must be greater than 0');
  return new Decimal(totalCharge).div(occupiedRooms).toDecimalPlaces(2);
}
