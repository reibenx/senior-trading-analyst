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

  it('tracks rank movement against the previous snapshot', () => {
    const first = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 82 }),
        opportunity({ symbol: 'BBB', opportunityScore: 72 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
    });

    const second = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 74 }),
        opportunity({ symbol: 'BBB', opportunityScore: 90 }),
        opportunity({ symbol: 'CCC', opportunityScore: 76 }),
      ],
      totalSymbols: 3,
      portfolioFingerprint: 'abc',
      previousRanking: first,
    });

    const aaa = second.items.find((item) => item.symbol === 'AAA');
    const bbb = second.items.find((item) => item.symbol === 'BBB');
    const ccc = second.items.find((item) => item.symbol === 'CCC');

    expect(bbb?.movement).toBe('UP');
    expect(bbb?.rankChange).toBe(1);
    expect(aaa?.movement).toBe('DOWN');
    expect(aaa?.rankChange).toBe(-2);
    expect(ccc?.movement).toBe('NEW');
  });

  it('detects a change in the #1 eligible asset for new capital', () => {
    const first = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 86 }),
        opportunity({ symbol: 'BBB', opportunityScore: 78 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
    });

    const second = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 75 }),
        opportunity({ symbol: 'BBB', opportunityScore: 92 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
      previousRanking: first,
    });

    expect(second.leaderChange.changed).toBe(true);
    expect(second.leaderChange.previousSymbol).toBe('AAA');
    expect(second.leaderChange.currentSymbol).toBe('BBB');
  });

  it('classifies portfolio, watchlist and first-seen external opportunities', () => {
    const sourceBySymbol = new Map<string, 'PORTFOLIO' | 'WATCHLIST'>([
      ['AAA', 'PORTFOLIO'],
      ['BBB', 'WATCHLIST'],
    ]);

    const first = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 82 }),
        opportunity({ symbol: 'BBB', opportunityScore: 80 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
      sourceBySymbol,
    });

    expect(first.items.find((item) => item.symbol === 'AAA')?.source).toBe('PORTFOLIO');
    expect(first.items.find((item) => item.symbol === 'BBB')?.source).toBe('NEW_OPPORTUNITY');
    expect(first.sourceCounts.newOpportunities).toBe(1);

    const second = buildTransversalRanking({
      opportunities: [
        opportunity({ symbol: 'AAA', opportunityScore: 82 }),
        opportunity({ symbol: 'BBB', opportunityScore: 80 }),
      ],
      totalSymbols: 2,
      portfolioFingerprint: 'abc',
      sourceBySymbol,
      previousRanking: first,
    });

    expect(second.items.find((item) => item.symbol === 'BBB')?.source).toBe('WATCHLIST');
    expect(second.sourceCounts.watchlist).toBe(1);
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
