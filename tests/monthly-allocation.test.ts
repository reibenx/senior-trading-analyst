import { describe, expect, it } from 'vitest';
import type { PortfolioOpportunity } from '@/core/domain/opportunity';
import type { TradePlan } from '@/core/domain/trading';
import { buildMonthlyAllocationPlan } from '@/core/engines/monthly-allocation';

const basePlan: TradePlan = {
  symbol: 'TEST',
  strategy: 'position',
  decision: 'ADD',
  scores: {
    technical: 80,
    fundamental: 80,
    valuation: 70,
    market: 70,
    riskReward: 70,
    portfolioFit: 80,
    conviction: 78,
  },
  currentPrice: 100,
  targets: [120],
  thesis: [],
  risks: [],
  invalidationConditions: [],
  generatedAt: new Date().toISOString(),
};

function opportunity(
  symbol: string,
  score: number,
  weight: number,
  action: PortfolioOpportunity['action'] = 'AUMENTAR',
  distanceToEntryPercent = 0,
): PortfolioOpportunity {
  return {
    symbol,
    strategy: 'position',
    decision: 'ADD',
    action,
    opportunityScore: score,
    currentWeightPercent: weight,
    distanceToEntryPercent,
    scores: { ...basePlan.scores, conviction: score },
    currentPrice: 100,
    entryLow: 95,
    entryHigh: 100,
    stop: 90,
    target: 120,
    thesis: [],
    risks: [],
    plan: { ...basePlan, symbol },
  };
}

describe('buildMonthlyAllocationPlan', () => {
  it('keeps cash reserve when at least one selected idea requires a pullback', () => {
    const result = buildMonthlyAllocationPlan([
      opportunity('AAA', 88, 3, 'AUMENTAR'),
      opportunity('BBB', 82, 4, 'COMPRAR_EN_PULLBACK', 6),
    ], 1000, 4);

    expect(result.cashReserve).toBeGreaterThanOrEqual(149);
    expect(result.allocated).toBeLessThanOrEqual(851);
    expect(result.items).toHaveLength(2);
  });

  it('excludes positions already at or above 20% portfolio weight', () => {
    const result = buildMonthlyAllocationPlan([
      opportunity('OVER', 95, 22, 'AUMENTAR'),
      opportunity('OK', 75, 5, 'AUMENTAR'),
    ], 1000, 4);

    expect(result.items.some((item) => item.symbol === 'OVER')).toBe(false);
    expect(result.items.some((item) => item.symbol === 'OK')).toBe(true);
  });

  it('holds all capital when no opportunity clears eligibility rules', () => {
    const result = buildMonthlyAllocationPlan([
      opportunity('LOW', 55, 4, 'MANTENER'),
    ], 1000, 4);

    expect(result.allocated).toBe(0);
    expect(result.cashReserve).toBe(1000);
    expect(result.items).toHaveLength(0);
  });
});
