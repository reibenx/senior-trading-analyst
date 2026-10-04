import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { createDemoBars } from '@/core/fixtures/demo-market';

const requestSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    // Temporal: fixture determinístico hasta conectar un MarketDataProvider real.
    const bars = createDemoBars();
    const snapshot = buildTechnicalSnapshot({ symbol: payload.symbol, timeframe: payload.timeframe, bars });
    return NextResponse.json({ source: 'demo-fixture', snapshot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis request', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to analyze symbol' }, { status: 500 });
  }
}
