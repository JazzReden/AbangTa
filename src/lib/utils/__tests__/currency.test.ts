import Decimal from 'decimal.js';
import {
  calculateConsumption,
  calculateEqualSplit,
  calculateMeteredCharge,
  formatPeso,
} from '../currency';

describe('currency utilities', () => {
  it('formats Philippine peso amounts', () => {
    expect(formatPeso(4525)).toBe('₱4,525.00');
    expect(formatPeso('150.5')).toBe('₱150.50');
  });

  it('calculates metered consumption without allowing negative usage', () => {
    expect(calculateConsumption(105, 108)?.toString()).toBe('3');
    expect(calculateConsumption(108, 105)).toBeNull();
  });

  it('supports meter reset consumption', () => {
    expect(calculateConsumption(108, 3, true)?.toString()).toBe('3');
  });

  it('calculates metered charges using Decimal math', () => {
    expect(calculateMeteredCharge(new Decimal(30), '15').toString()).toBe('450');
  });

  it('calculates equal split utility charges', () => {
    expect(calculateEqualSplit('6000', 10).toString()).toBe('600');
  });
});
