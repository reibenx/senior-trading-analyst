import { describe, expect, it } from 'vitest';
import type { CedearConversion, CedearExecutionIntent } from '@/core/domain/cedear';
import { buildCedearExecutionPlan } from '@/core/engines/cedear-execution';
import { revalidateCedearExecution } from '@/core/services/revalidate-cedear-execution';

function conversion(overrides: Partial<CedearConversion> = {}): CedearConversion {
  const now = new Date().toISOString();
  return {
    symbol: 'NVDA',
    underlyingSymbol: 'NVDA',
    cedearsPerUnderlyingShare: 24,
    cclArsPerUsd: 1600,
    localPriceArs: 16000,
    marketStatus: 'OPEN',
    quoteTimestamp: now,
    updatedAt: now,
    source: 'test',
    ...overrides,
  };
}

function intent(overrides: Partial<CedearExecutionIntent> = {}): CedearExecutionIntent {
  return {
    symbol: 'NVDA',
    allocationUsd: 1000,
    previewLocalPriceArs: 16000,
    previewQuantity: 100,
    previewCclArsPerUsd: 1600,
    previewRatio: 24,
    previewedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildCedearExecutionPlan', () => {
  it('converts USD planning capital into whole local CEDEAR units', () => {
    const result = buildCedearExecutionPlan(1000, conversion());
    expect(result.estimatedBudgetArs).toBe(1_600_000);
    expect(result.quantity).toBe(100);
    expect(result.estimatedCostArs).toBe(1_600_000);
    expect(result.residualArs).toBe(0);
  });

  it('never allocates fractional CEDEAR units', () => {
    const result = buildCedearExecutionPlan(100, conversion({ localPriceArs: 33_000 }));
    expect(result.quantity).toBe(4);
    expect(result.estimatedCostArs).toBe(132_000);
    expect(result.residualArs).toBe(28_000);
  });
});

describe('revalidateCedearExecution', () => {
  it('returns READY_TO_CONFIRM when quote, ratio, CCL and market remain valid', () => {
    const result = revalidateCedearExecution(intent(), conversion(), {
      maxQuoteAgeSeconds: 120,
      maxPriceDriftPercent: 1,
      maxCclDriftPercent: 1.5,
    });
    expect(result.readyToConfirm).toBe(true);
    expect(result.status).toBe('READY_TO_CONFIRM');
    expect(result.refreshedPlan?.quantity).toBe(100);
  });

  it('allows an implied cable CCL when it remains close to the benchmark', () => {
    const result = revalidateCedearExecution(intent(), conversion({
      cclSource: 'IMPLIED_CABLE',
      cableSymbol: 'NVDAC',
      benchmarkCclArsPerUsd: 1590,
      cclBenchmarkDeviationPercent: 0.63,
    }), {
      maxCclBenchmarkDeviationPercent: 2.5,
    });
    expect(result.readyToConfirm).toBe(true);
    expect(result.status).toBe('READY_TO_CONFIRM');
    expect(result.cclBenchmarkDeviationPercent).toBe(0.63);
  });

  it('blocks an implied cable CCL that diverges excessively from the benchmark', () => {
    const result = revalidateCedearExecution(intent(), conversion({
      cclSource: 'IMPLIED_CABLE',
      cableSymbol: 'NVDAC',
      benchmarkCclArsPerUsd: 1500,
      cclBenchmarkDeviationPercent: 6.67,
    }), {
      maxCclBenchmarkDeviationPercent: 2.5,
    });
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('CCL_BENCHMARK_DIVERGED');
    expect(result.cclBenchmarkDeviationPercent).toBe(6.67);
  });

  it('blocks when the market is closed', () => {
    const result = revalidateCedearExecution(intent(), conversion({ marketStatus: 'CLOSED' }));
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('MARKET_CLOSED');
  });

  it('blocks stale quotes', () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const result = revalidateCedearExecution(intent(), conversion({ quoteTimestamp: old }), {
      maxQuoteAgeSeconds: 120,
    });
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('STALE_QUOTE');
  });

  it('blocks excessive local price drift', () => {
    const result = revalidateCedearExecution(intent(), conversion({ localPriceArs: 16_500 }), {
      maxPriceDriftPercent: 1,
    });
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('PRICE_MOVED');
  });

  it('blocks ratio changes', () => {
    const result = revalidateCedearExecution(intent(), conversion({ cedearsPerUnderlyingShare: 30 }));
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('RATIO_CHANGED');
  });

  it('blocks excessive CCL drift', () => {
    const result = revalidateCedearExecution(intent(), conversion({ cclArsPerUsd: 1700 }), {
      maxCclDriftPercent: 1.5,
    });
    expect(result.readyToConfirm).toBe(false);
    expect(result.status).toBe('CCL_MOVED');
  });
});
