import type { Timeframe } from '@/core/domain/market';
import type { Strategy } from '@/core/domain/trading';
import { calculateFundamentalScore } from '@/core/engines/fundamental-score';
import { buildMarketContext, getSectorEtf } from '@/core/engines/market-context';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { getFundamentalProvider } from '@/core/providers/alpha-vantage-fundamentals';
import { getMarketDataProvider } from '@/core/providers/market-provider';

const CONTEXT_TIMEFRAME: Record<Strategy, Timeframe> = {
  day: '15m',
  swing: '1d',
  position: '1w',
};

export interface AnalyzeSymbolInput {
  symbol: string;
  strategy: Strategy;
  timeframe: Timeframe;
  includeSectorContext?: boolean;
}

export async function analyzeSymbol(input: AnalyzeSymbolInput) {
  const symbol = input.symbol.trim().toUpperCase();
  const marketProvider = getMarketDataProvider();
  const fundamentalProvider = getFundamentalProvider();

  const [bars, fundamentalSnapshot] = await Promise.all([
    marketProvider.getBars({ symbol, timeframe: input.timeframe, limit: 260 }),
    fundamentalProvider
      ? fundamentalProvider.getFundamentals(symbol).catch(() => null)
      : Promise.resolve(null),
  ]);

  const snapshot = buildTechnicalSnapshot({ symbol, timeframe: input.timeframe, bars });
  const fundamentalScore = fundamentalSnapshot ? calculateFundamentalScore(fundamentalSnapshot) : null;

  let marketContext = null;
  if (marketProvider.id !== 'demo-fixture') {
    const contextTimeframe = CONTEXT_TIMEFRAME[input.strategy];
    const sectorSymbol = input.includeSectorContext === false
      ? undefined
      : getSectorEtf(fundamentalSnapshot?.sector);

    try {
      const [benchmarkBars, sectorBars] = await Promise.all([
        marketProvider.getBars({ symbol: 'SPY', timeframe: contextTimeframe, limit: 260 }),
        sectorSymbol
          ? marketProvider.getBars({ symbol: sectorSymbol, timeframe: contextTimeframe, limit: 260 })
          : Promise.resolve(null),
      ]);

      const benchmarkSnapshot = buildTechnicalSnapshot({ symbol: 'SPY', timeframe: contextTimeframe, bars: benchmarkBars });
      const sectorSnapshot = sectorBars && sectorSymbol
        ? buildTechnicalSnapshot({ symbol: sectorSymbol, timeframe: contextTimeframe, bars: sectorBars })
        : undefined;

      marketContext = buildMarketContext(benchmarkSnapshot, sectorSnapshot);
    } catch {
      marketContext = null;
    }
  }

  return {
    source: marketProvider.id,
    bars,
    snapshot,
    fundamentals: fundamentalSnapshot,
    fundamentalScore,
    fundamentalSource: fundamentalProvider?.id ?? null,
    marketContext,
  };
}
