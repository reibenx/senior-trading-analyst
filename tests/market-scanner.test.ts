import { describe, expect, it } from 'vitest';
import type { TechnicalSnapshot } from '../core/domain/market';
import {
  parseScannerUniverse,
  preScoreTechnicalCandidate,
} from '../core/monitoring/market-scanner';

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
