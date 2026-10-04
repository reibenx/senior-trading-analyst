import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeSymbol } from '@/core/services/analyze-symbol';
import { appendActivity } from '@/core/persistence/activity-store';

const requestSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  strategy: z.enum(['day', 'swing', 'position']).default('swing'),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const analysis = await analyzeSymbol(payload);

    await appendActivity({
      kind: 'SIGNAL',
      symbol: payload.symbol,
      title: `Análisis ${payload.strategy} · ${payload.symbol}`,
      detail: `${analysis.snapshot.trend} / ${analysis.snapshot.structure} · ${payload.timeframe}`,
      severity: 'INFO',
      metadata: {
        strategy: payload.strategy,
        timeframe: payload.timeframe,
        source: analysis.source,
        currentPrice: analysis.snapshot.currentPrice,
        trend: analysis.snapshot.trend,
        structure: analysis.snapshot.structure,
        rsi14: analysis.snapshot.rsi14,
        atr14: analysis.snapshot.atr14,
        fundamentalScore: analysis.fundamentalScore,
        marketScore: analysis.marketContext?.score ?? null,
      },
    }).catch((error) => console.error('[ACTIVITY_STORE_ERROR]', error));

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis request', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Unable to analyze symbol';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
