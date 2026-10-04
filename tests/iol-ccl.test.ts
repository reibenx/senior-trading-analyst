import { describe, expect, it } from 'vitest';
import { calculateImpliedCcl } from '@/core/providers/iol-direct-quotes';

describe('calculateImpliedCcl', () => {
  it('derives ARS/USD cable parity from ARS and cable prices', () => {
    const result = calculateImpliedCcl(15_850, 9.79);
    expect(result).toBeCloseTo(1618.9989, 3);
  });

  it('rejects non-positive or invalid prices', () => {
    expect(calculateImpliedCcl(0, 9.79)).toBeUndefined();
    expect(calculateImpliedCcl(15_850, 0)).toBeUndefined();
    expect(calculateImpliedCcl(Number.NaN, 9.79)).toBeUndefined();
  });
});
