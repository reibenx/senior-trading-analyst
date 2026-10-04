import { describe, expect, it } from 'vitest';
import { decisionSignalRule } from '@/core/monitoring/rules';
import type { TradePlan } from '@/core/domain/trading';

function plan(decision: TradePlan['decision']): TradePlan {
  return {
    symbol: 'NVDA',
    strategy: 'position',
    decision,
    scores: {
      technical: 70,
      fundamental: 80,
      valuation: 60,
      market: 65,
      riskReward: 72,
      portfolioFit: 55,
      conviction: 68,
    },
    currentPrice: 100,
    targets: [110, 120],
    thesis: [],
    risks: [],
    invalidationConditions: [],
    generatedAt: new Date().toISOString(),
  };
}

describe('decisionSignalRule', () => {
  it('stays silent for HOLD', () => {
    expect(decisionSignalRule.evaluate(plan('HOLD'))).toBeNull();
  });

  it('emits an opportunity for ADD', () => {
    const alert = decisionSignalRule.evaluate(plan('ADD'));
    expect(alert).toMatchObject({
      symbol: 'NVDA',
      severity: 'OPPORTUNITY',
      type: 'DECISION_SIGNAL',
    });
    expect(alert?.title).toContain('AUMENTAR');
  });

  it('emits a critical alert for EXIT', () => {
    const alert = decisionSignalRule.evaluate(plan('EXIT'));
    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.title).toContain('SALIR');
  });
});
