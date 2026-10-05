import { describe, expect, it } from 'vitest';
import type { TechnicalSnapshot } from '../core/domain/market';
import { buildTradePlan } from '../core/services/build-trade-plan';

const snapshot: TechnicalSnapshot = {
  symbol: 'TEST',
  timeframe: '1d',
  currentPrice: 95,
  ema9: 96,
  ema21: 94,
  ema50: 90,
  ema200: 80,
  atr14: 4,
  rsi14: 55,
  trend: 'BULL',
  structure: 'HH_HL',
  supportLevels: [90],
  resistanceLevels: [110],
  overlays: [
    { id: 'entry-a', kind: 'entry-zone', label: 'Entry A', low: 95, high: 100 },
    { id: 'entry-b', kind: 'entry-zone', label: 'Entry B', low: 85, high: 90 },
    { id: 'stop', kind: 'stop', label: 'Stop', value: 80 },
    { id: 'tp1', kind: 'target', label: 'TP1', value: 110 },
    { id: 'tp2', kind: 'target', label: 'TP2', value: 120 },
  ],
};

describe('buildTradePlan strategy presets', () => {
  it('uses Entry B as the risk/reward reference for position strategy', () => {
    const plan = buildTradePlan({ strategy: 'position', snapshot });
    expect(plan.riskProfile?.preferredEntry).toBe('B');
    expect(plan.riskReward).toBe(2);
  });

  it('uses Entry A as the risk/reward reference for swing strategy', () => {
    const plan = buildTradePlan({ strategy: 'swing', snapshot });
    expect(plan.riskProfile?.preferredEntry).toBe('A');
    expect(plan.riskReward).toBe(0.5);
  });
});
