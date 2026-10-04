import { describe, expect, it } from 'vitest';
import type {
  CclProvider,
  CedearRatioProvider,
  LocalQuoteProvider,
} from '@/core/providers/cedear-provider-contracts';
import { CompositeCedearConversionProvider } from '@/core/providers/cedear-conversion-bridge';

const now = new Date().toISOString();
const hoursAgo = new Date(Date.now() - 4 * 60 * 60_000).toISOString();

class TestRatioProvider implements CedearRatioProvider {
  readonly id = 'test-ratios';
  async getRatios() {
    return [{
      symbol: 'NVDA',
      underlyingSymbol: 'NVDA',
      cedearsPerUnderlyingShare: 24,
      updatedAt: hoursAgo,
      source: 'test-ratios',
    }];
  }
}

class TestQuoteProvider implements LocalQuoteProvider {
  readonly id = 'test-quotes';
  async getQuotes() {
    return [{
      symbol: 'NVDA',
      localPriceArs: 15_850,
      impliedCclArsPerUsd: 1619,
      cableSymbol: 'NVDAC',
      marketStatus: 'OPEN' as const,
      quoteTimestamp: now,
      source: 'test-quotes',
    }];
  }
}

class TestCclProvider implements CclProvider {
  readonly id = 'test-ccl';
  async getCcl() {
    return {
      cclArsPerUsd: 1600,
      updatedAt: now,
      source: 'test-ccl',
    };
  }
}

describe('CompositeCedearConversionProvider', () => {
  it('tracks old ratio timestamp separately from fresh market data', async () => {
    const provider = new CompositeCedearConversionProvider(
      new TestRatioProvider(),
      new TestQuoteProvider(),
      new TestCclProvider(),
    );

    const [result] = await provider.getConversions(['NVDA']);
    expect(result.ratioUpdatedAt).toBe(hoursAgo);
    expect(result.updatedAt).toBe(now);
    expect(result.quoteTimestamp).toBe(now);
  });

  it('uses the implied cable CCL and records its benchmark deviation', async () => {
    const provider = new CompositeCedearConversionProvider(
      new TestRatioProvider(),
      new TestQuoteProvider(),
      new TestCclProvider(),
    );

    const [result] = await provider.getConversions(['NVDA']);
    expect(result.cclSource).toBe('IMPLIED_CABLE');
    expect(result.cableSymbol).toBe('NVDAC');
    expect(result.cclArsPerUsd).toBe(1619);
    expect(result.benchmarkCclArsPerUsd).toBe(1600);
    expect(result.cclBenchmarkDeviationPercent).toBeCloseTo(1.1875, 4);
  });
});
