import { describe, expect, it } from 'vitest';
import { buildPortfolioFingerprint, portfolioOpportunityTtlSeconds } from '@/core/persistence/portfolio-opportunity-store';
import type { Position } from '@/core/domain/trading';

const basePositions: Position[] = [
  { symbol: 'NVDA', quantity: 10, marketValue: 1000 },
  { symbol: 'GOOGL', quantity: 5, marketValue: 500 },
];

describe('portfolio opportunity cache', () => {
  it('is stable regardless of position order', () => {
    expect(buildPortfolioFingerprint(basePositions)).toBe(
      buildPortfolioFingerprint([...basePositions].reverse()),
    );
  });

  it('changes when portfolio composition changes', () => {
    const changed = basePositions.map((position) =>
      position.symbol === 'NVDA' ? { ...position, quantity: 11 } : position,
    );
    expect(buildPortfolioFingerprint(changed)).not.toBe(buildPortfolioFingerprint(basePositions));
  });

  it('uses strategy-aware cache horizons', () => {
    expect(portfolioOpportunityTtlSeconds('day')).toBe(600);
    expect(portfolioOpportunityTtlSeconds('swing')).toBe(3600);
    expect(portfolioOpportunityTtlSeconds('position')).toBe(21600);
  });
});
