import { describe, expect, it } from 'vitest';
import type { Position, TradePlan } from '../core/domain/trading';
import { buildPortfolioOpportunity } from '../core/engines/opportunity';
import { buildMonthlyAllocationPlan } from '../core/engines/monthly-allocation';

const positions: Position[] = [
  { symbol: 'TEST', quantity: 10, marketValue: 1_000, currency: 'USD' },
  { symbol: 'OTHER', quantity: 10, marketValue: 9_000, currency: 'USD' },
];

function plan(regime: 'RISK_ON' | 'DEFENSIVE', priorityScore: number): TradePlan {
  return {
    symbol: 'TEST',
    strategy: 'position',
    decision: 'ADD',
    scores: {
      technical: 80,
      fundamental: 75,
      valuation: 72,
      market: regime === 'RISK_ON' ? 80 : 30,
      riskReward: 75,
      portfolioFit: 80,
      conviction: 78,
    },
    currentPrice: 90,
    entryA: { low: 96, high: 100 },
    entryB: { low: 88, high: 92 },
    stop: 80,
    targets: [110, 120],
    riskProfile: {
      label: 'Position · amplio',
      riskPercent: 1.25,
      maxPositionPercent: 35,
      trailingAtr: 3.5,
      tp1Percent: 20,
      tp2Percent: 30,
      runnerPercent: 50,
      preferredEntry: 'B',
    },
    signalPriority: {
      score: priorityScore,
      level: priorityScore >= 72 ? 'HIGH' : 'MEDIUM',
      marketRegime: regime,
      contextCoverage: 'BENCHMARK_ONLY',
      reasons: [],
    },
    thesis: [],
    risks: [],
    invalidationConditions: [],
    generatedAt: new Date().toISOString(),
  };
}

describe('senior portfolio opportunity ranking', () => {
  it('ranks the same idea higher in risk-on than defensive regime', () => {
    const riskOn = buildPortfolioOpportunity(plan('RISK_ON', 80), positions);
    const defensive = buildPortfolioOpportunity(plan('DEFENSIVE', 60), positions);

    expect(riskOn.opportunityScore).toBeGreaterThan(defensive.opportunityScore);
    expect(riskOn.action).toBe('AUMENTAR');
    expect(defensive.action).toBe('MANTENER');
  });

  it('uses preferred Entry B for position ranking distance', () => {
    const opportunity = buildPortfolioOpportunity(plan('RISK_ON', 80), positions);
    expect(opportunity.preferredEntry).toBe('B');
    expect(opportunity.distanceToEntryPercent).toBe(0);
    expect(opportunity.entryLow).toBe(88);
    expect(opportunity.entryHigh).toBe(92);
  });

  it('does not allocate new monthly capital to defensive buy ideas', () => {
    const riskOn = buildPortfolioOpportunity(plan('RISK_ON', 80), positions);
    const defensivePlan = plan('DEFENSIVE', 75);
    defensivePlan.decision = 'STRONG_ADD';
    defensivePlan.signalPriority = {
      ...defensivePlan.signalPriority!,
      level: 'HIGH',
      score: 75,
    };
    const defensive = buildPortfolioOpportunity(defensivePlan, positions);

    const allocation = buildMonthlyAllocationPlan([riskOn, defensive], 1_000, 4);
    expect(allocation.items.map((item) => item.symbol)).toEqual(['TEST']);
  });
});
