import { describe, expect, it } from 'vitest';
import type { AlertEvent, TradePlan } from '../core/domain/trading';
import { DEFAULT_ALERT_PREFERENCES, shouldNotifyAlert } from '../core/monitoring/preferences';

const basePlan: TradePlan = {
  symbol: 'TEST',
  strategy: 'swing',
  decision: 'ADD',
  scores: {
    technical: 70,
    fundamental: 70,
    valuation: 65,
    market: 60,
    riskReward: 70,
    portfolioFit: 60,
    conviction: 65,
  },
  currentPrice: 100,
  signalPriority: {
    score: 72,
    level: 'HIGH',
    marketRegime: 'RISK_ON',
    contextCoverage: 'BENCHMARK_ONLY',
    reasons: [],
  },
  entryA: { low: 99, high: 101 },
  entryB: { low: 94, high: 96 },
  stop: 90,
  targets: [110, 120],
  thesis: [],
  risks: [],
  invalidationConditions: [],
  generatedAt: new Date().toISOString(),
};

function event(type: string): AlertEvent {
  return {
    id: '1',
    symbol: 'TEST',
    severity: 'OPPORTUNITY',
    type,
    title: type,
    message: type,
    createdAt: new Date().toISOString(),
  };
}

describe('alert preferences policy', () => {
  it('filters discretionary signals below conviction threshold', () => {
    const plan = { ...basePlan, scores: { ...basePlan.scores, conviction: 55 } };
    expect(shouldNotifyAlert(plan, event('ENTRY_ZONE'), DEFAULT_ALERT_PREFERENCES)).toBe(false);
    expect(shouldNotifyAlert(plan, event('DECISION_SIGNAL'), DEFAULT_ALERT_PREFERENCES)).toBe(false);
  });

  it('does not suppress stop breach because conviction is low', () => {
    const plan = { ...basePlan, scores: { ...basePlan.scores, conviction: 10 } };
    expect(shouldNotifyAlert(plan, event('STOP_BREACH'), DEFAULT_ALERT_PREFERENCES)).toBe(true);
  });

  it('can disable Entry A independently from Entry B', () => {
    const preferences = { ...DEFAULT_ALERT_PREFERENCES, entryA: false, entryB: true };
    expect(shouldNotifyAlert(basePlan, event('ENTRY_ZONE'), preferences)).toBe(false);

    const entryBPlan = { ...basePlan, currentPrice: 95 };
    expect(shouldNotifyAlert(entryBPlan, event('ENTRY_ZONE'), preferences)).toBe(true);
  });

  it('filters strategies not selected by the user', () => {
    const preferences = { ...DEFAULT_ALERT_PREFERENCES, strategies: ['position'] as const };
    expect(shouldNotifyAlert(basePlan, event('STOP_BREACH'), { ...preferences, strategies: [...preferences.strategies] })).toBe(false);
  });
});
