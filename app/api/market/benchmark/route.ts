import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeSymbol } from '@/core/services/analyze-symbol';

const querySchema = z.object({
  symbol: z.enum(['SPY', 'QQQ', 'XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLP', 'XLY']),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ symbol: url.searchParams.get('symbol')?.toUpperCase() });
  if (!parsed.success) return NextResponse.json({ error: 'Benchmark inválido.' }, { status: 400 });

  try {
    const result = await analyzeSymbol({
      symbol: parsed.data.symbol,
      strategy: 'swing',
      timeframe: '1d',
      includeFundamentals: false,
      includeSectorContext: false,
      includeMarketContext: false,
    });

    return NextResponse.json({
      source: result.source,
      symbol: parsed.data.symbol,
      snapshot: result.snapshot,
      bars: result.bars.slice(-120),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No fue posible consultar el benchmark.' }, { status: 502 });
  }
}
