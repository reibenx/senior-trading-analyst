import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { calculateFundamentalScore } from '@/core/engines/fundamental-score';
import { getMarketDataProvider } from '@/core/providers/market-provider';
import { getFundamentalProvider } from '@/core/providers/alpha-vantage-fundamentals';

const requestSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
});

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

    return NextResponse.json({
      source: marketProvider.id,
      bars,
      snapshot,
      fundamentals: fundamentalSnapshot,
      fundamentalScore,
      fundamentalSource: fundamentalProvider?.id ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis request', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Unable to analyze symbol';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
