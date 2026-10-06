import { describe, expect, it } from 'vitest';
import type { TechnicalSnapshot } from '../core/domain/market';
import type { ScoreCard } from '../core/domain/trading';
import { calculateSignalPriority } from '../core/engines/signal-priority';

const technical: TechnicalSnapshot = {
  symbol: 'TEST',
  timeframe: '1d',
  currentPrice: 100,
  ema9: 99,
  ema21: 97,
  ema50: 94,
  ema200: 80,
  atr14: 3,
  rsi14: 58,
  trend: 'BULL',
  structure: 'HH_HL',
  supportLevels: [95],
  resistanceLevels: [110],
  overlays: [],
};

const scores: ScoreCard = {
  technical: 82,
  fundamental: 70,
  valuation: 65,
  market: 75,
  riskReward: 80,
  portfolioFit: 70,
  conviction: 76,
};

describe('signal priority engine', () => {
  it('raises an ADD signal when market and structure are aligned', () => {
    const result = calculateSignalPriority({
      strategy: 'swing',
      decision: 'ADD',
      scores,
      technical,
      marketContext: {
        benchmarkSymbol: 'SPY',
        benchmarkTrend: 'BULL',
        sectorSymbol: 'XLK',
        sectorTrend: 'BULL',
        score: 82,
        reasons: [],
      },
    });

    expect(result.marketRegime).toBe('RISK_ON');
    expect(result.contextCoverage).toBe('FULL');
    expect(['HIGH', 'CRITICAL']).toContain(result.level);
    expect(result.score).toBeGreaterThanOrEqual(72);
  });

  it('penalizes a bullish entry in a defensive market regime', () => {
    const result = calculateSignalPriority({
      strategy: 'swing',
      decision: 'ADD',
      scores: { ...scores, market: 30 },
      technical,
      marketContext: {
        benchmarkSymbol: 'SPY',
        benchmarkTrend: 'BEAR',
        sectorSymbol: 'XLK',
        sectorTrend: 'BEAR',
        score: 25,
        reasons: [],
      },
    });

    expect(result.marketRegime).toBe('DEFENSIVE');
    expect(result.score).toBeLessThan(72);
  });

  it('treats EXIT as critical under deterioration', () => {
    const result = calculateSignalPriority({
      strategy: 'position',
      decision: 'EXIT',
      scores: { ...scores, conviction: 45, technical: 25, market: 20 },
      technical: { ...technical, trend: 'BEAR', structure: 'LH_LL' },
      marketContext: {
        benchmarkSymbol: 'SPY',
        benchmarkTrend: 'BEAR',
        score: 20,
        reasons: [],
      },
    });

    expect(result.level).toBe('CRITICAL');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
