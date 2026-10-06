import { describe, expect, it } from 'vitest';
import type { PortfolioOpportunity } from '../core/domain/opportunity';
import { buildTransversalRanking } from '../core/engines/transversal-ranking';

function opportunity(overrides: Partial<PortfolioOpportunity> = {}): PortfolioOpportunity {
  return {
    symbol: 'AAA',
    strategy: 'position',
    decision: 'ADD',
    action: 'AUMENTAR',
    opportunityScore: 80,
    signalPriorityScore: 82,
    signalPriorityLevel: 'HIGH',
    marketRegime: 'RISK_ON',
    contextCoverage: 'BENCHMARK_ONLY',
    currentWeightPercent: 5,
    scores: {
      technical: 82,
      fundamental: 70,
      valuation: 68,
      market: 78,
      riskReward: 80,
      portfolioFit: 75,
      conviction: 79,
    },
    currentPrice: 100,
    thesis: [],
    risks: [],
    plan: {
      symbol: 'AAA',
      strategy: 'position',
      decision: 'ADD',
      scores: {
        technical: 82,
        fundamental: 70,
        valuation: 68,
        market: 78,
        riskReward: 80,
        portfolioFit: 75,
        conviction: 79,
      },
      currentPrice: 100,
      targets: [115],
      thesis: [],
      risks: [],
      invalidationConditions: [],
      generatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('transversal ranking', () => {
  it('ranks the stronger adjusted opportunity first', () => {
    const ranking = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 82 }),
        opportunity({ symbol: 'BBB', opportunityScore: 70, signalPriorityLevel: 'MEDIUM', signalPriorityScore: 65 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
    });

    expect(ranking.items[0].symbol).toBe('AAA');
    expect(ranking.coveragePercent).toBe(100);
  });

  it('penalizes a concentrated holding', () => {
    const lowWeight = opportunity({ symbol: 'LOW', currentWeightPercent: 4, opportunityScore: 78 });
    const concentrated = opportunity({ symbol: 'HIGH', currentWeightPercent: 22, opportunityScore: 78 });

    const ranking = buildTransversalRanking({
      opportunities: [concentrated, lowWeight],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
    });

    expect(ranking.items[0].symbol).toBe('LOW');
    expect(ranking.items.find((item) => item.symbol === 'HIGH')?.eligibleForNewCapital).toBe(false);
  });

  it('reports partial coverage without pretending the universe is complete', () => {
    const ranking = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA' }),
        opportunity({ symbol: 'BBB' }),
      ],
      totalSymbols: 5,
      portfolioFingerprint: 'abc',
    });

    expect(ranking.coveredSymbols).toBe(2);
    expect(ranking.totalSymbols).toBe(5);
    expect(ranking.coveragePercent).toBe(40);
  });

  it('blocks bullish new capital in defensive regime', () => {
    const defensive = opportunity({
      symbol: 'DEF',
      marketRegime: 'DEFENSIVE',
      action: 'AUMENTAR',
      opportunityScore: 85,
    });

    const ranking = buildTransversalRanking({
      opportunities: [defensive],
      totalSymbols: 1,
      portfolioFingerprint: 'abc',
    });

    expect(ranking.items[0].eligibleForNewCapital).toBe(false);
    expect(ranking.items[0].notes.join(' ')).toContain('Régimen defensivo');
  });
});
