import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Timeframe } from '@/core/domain/market';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { calculateFundamentalScore } from '@/core/engines/fundamental-score';
import { buildMarketContext, getSectorEtf } from '@/core/engines/market-context';
import { getMarketDataProvider } from '@/core/providers/market-provider';
import { getFundamentalProvider } from '@/core/providers/alpha-vantage-fundamentals';

const requestSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  strategy: z.enum(['day', 'swing', 'position']).default('swing'),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
});

const CONTEXT_TIMEFRAME: Record<'day' | 'swing' | 'position', Timeframe> = {
  day: '15m',
  swing: '1d',
  position: '1w',
};

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const marketProvider = getMarketDataProvider();
    const fundamentalProvider = getFundamentalProvider();

    const [bars, fundamentalSnapshot] = await Promise.all([
      marketProvider.getBars({ symbol: payload.symbol, timeframe: payload.timeframe, limit: 260 }),
      fundamentalProvider
        ? fundamentalProvider.getFundamentals(payload.symbol).catch(() => null)
        : Promise.resolve(null),
    ]);

    const snapshot = buildTechnicalSnapshot({ symbol: payload.symbol, timeframe: payload.timeframe, bars });
    const fundamentalScore = fundamentalSnapshot ? calculateFundamentalScore(fundamentalSnapshot) : null;

    let marketContext = null;
    if (marketProvider.id !== 'demo-fixture') {
      const contextTimeframe = CONTEXT_TIMEFRAME[payload.strategy];
      const sectorSymbol = getSectorEtf(fundamentalSnapshot?.sector);

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

    return NextResponse.json({
      source: marketProvider.id,
      bars,
      snapshot,
      fundamentals: fundamentalSnapshot,
      fundamentalScore,
      fundamentalSource: fundamentalProvider?.id ?? null,
      marketContext,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis request', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Unable to analyze symbol';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
