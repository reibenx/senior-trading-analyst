import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { getMarketDataProvider } from '@/core/providers/market-provider';

const requestSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = getMarketDataProvider();
    const bars = await provider.getBars({ symbol: payload.symbol, timeframe: payload.timeframe, limit: 260 });
    const snapshot = buildTechnicalSnapshot({ symbol: payload.symbol, timeframe: payload.timeframe, bars });

    return NextResponse.json({ source: provider.id, bars, snapshot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis request', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Unable to analyze symbol';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
