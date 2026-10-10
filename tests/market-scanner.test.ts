import { describe, expect, it } from 'vitest';
import type { TechnicalSnapshot } from '../core/domain/market';
import {
  parseScannerUniverse,
  preScoreTechnicalCandidate,
  scannerDiscoveryPriority,
  scannerPromotionEligible,
} from '../core/monitoring/market-scanner';
import { buildScannerDiscoveryState } from '../core/monitoring/scanner-history-store';

function snapshot(overrides: Partial<TechnicalSnapshot> = {}): TechnicalSnapshot {
  return {
    symbol: 'AAA',
    timeframe: '1w',
    currentPrice: 120,
    ema21: 110,
    ema50: 100,
    ema200: 90,
    rsi14: 58,
    trend: 'BULL',
    structure: 'HH_HL',
    supportLevels: [],
    resistanceLevels: [],
    overlays: [],
    ...overrides,
  };
}

describe('market scanner', () => {
  it('deduplicates and normalizes a configured universe', () => {
    expect(parseScannerUniverse(' aapl,MSFT,aapl ')).toEqual(['AAPL', 'MSFT']);
  });

  it('promotes constructive bullish technical structure', () => {
    const candidate = preScoreTechnicalCandidate('AAA', snapshot(), 'position');
    expect(candidate.score).toBeGreaterThanOrEqual(66);
    expect(candidate.reasons).toContain('Tendencia alcista');
    expect(candidate.reasons).toContain('Estructura HH/HL');
  });

  it('classifies scanner momentum and boosts accelerating discoveries', () => {
    const history = {
      symbol: 'AAA',
      strategy: 'position' as const,
      observations: [
        { score: 68, observedAt: '2026-10-09T12:00:00.000Z' },
        { score: 72, observedAt: '2026-10-09T13:00:00.000Z' },
      ],
    };
    const accelerating = buildScannerDiscoveryState('AAA', 'position', 79, history);
    const stable = buildScannerDiscoveryState('BBB', 'position', 79, {
      symbol: 'BBB',
      strategy: 'position',
      observations: [{ score: 77, observedAt: '2026-10-09T13:00:00.000Z' }],
    });

    expect(accelerating.trend).toBe('ACCELERATING');
    expect(accelerating.scoreDelta).toBe(7);
    expect(accelerating.observations).toBe(3);
    expect(scannerDiscoveryPriority(accelerating)).toBeGreaterThan(scannerDiscoveryPriority(stable));
  });

  it('requires temporal confirmation unless the score qualifies for fast-track', () => {
    const firstObservation = buildScannerDiscoveryState('AAA', 'position', 78, null);
    const confirmed = buildScannerDiscoveryState('BBB', 'position', 78, {
      symbol: 'BBB',
      strategy: 'position',
      observations: [{ score: 76, observedAt: '2026-10-09T13:00:00.000Z' }],
    });
    const fastTrack = buildScannerDiscoveryState('CCC', 'position', 88, null);

    expect(scannerPromotionEligible(firstObservation, 66, 2, 85)).toBe(false);
    expect(scannerPromotionEligible(confirmed, 66, 2, 85)).toBe(true);
    expect(scannerPromotionEligible(fastTrack, 66, 2, 85)).toBe(true);
  });

  it('never promotes a deteriorating candidate even above the score threshold', () => {
    const deteriorating = buildScannerDiscoveryState('AAA', 'position', 78, {
      symbol: 'AAA',
      strategy: 'position',
      observations: [{ score: 86, observedAt: '2026-10-09T13:00:00.000Z' }],
    });
    expect(deteriorating.trend).toBe('DETERIORATING');
    expect(scannerPromotionEligible(deteriorating, 66, 2, 85)).toBe(false);
  });

  it('classifies a meaningful score deterioration', () => {
    const state = buildScannerDiscoveryState('AAA', 'position', 66, {
      symbol: 'AAA',
      strategy: 'position',
      observations: [{ score: 74, observedAt: '2026-10-09T13:00:00.000Z' }],
    });
    expect(state.trend).toBe('DETERIORATING');
    expect(state.scoreDelta).toBe(-8);
  });

  it('rejects structurally weak bearish candidates', () => {
    const candidate = preScoreTechnicalCandidate('BBB', snapshot({
      currentPrice: 80,
      ema21: 90,
      ema50: 100,
      ema200: 110,
      rsi14: 31,
      trend: 'BEAR',
      structure: 'LH_LL',
    }), 'position');

    expect(candidate.score).toBeLessThan(50);
    expect(candidate.reasons).toContain('Tendencia bajista');
  });
});
