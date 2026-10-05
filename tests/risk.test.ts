import { describe, expect, it } from 'vitest';
import { calculatePositionSizing } from '../core/engines/risk';

describe('calculatePositionSizing', () => {
  it('caps quantity by max position allocation', () => {
    const result = calculatePositionSizing({
      capital: 10_000,
      riskPercent: 2,
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 115,
      maxPositionPercent: 20,
    });

    expect(result).not.toBeNull();
    expect(result?.quantity).toBe(20);
    expect(result?.positionValue).toBe(2_000);
    expect(result?.capitalUtilizationPercent).toBe(20);
    expect(result?.riskReward).toBe(3);
  });

  it('keeps the risk cap when it is stricter than allocation', () => {
    const result = calculatePositionSizing({
      capital: 10_000,
      riskPercent: 1,
      entryPrice: 100,
      stopPrice: 90,
      maxPositionPercent: 80,
    });

    expect(result?.quantity).toBe(10);
    expect(result?.positionValue).toBe(1_000);
  });

  it('rejects invalid max allocation values', () => {
    expect(calculatePositionSizing({
      capital: 10_000,
      riskPercent: 1,
      entryPrice: 100,
      stopPrice: 90,
      maxPositionPercent: 0,
    })).toBeNull();
  });
});
