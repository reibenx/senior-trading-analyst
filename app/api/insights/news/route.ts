import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInsightsProvider } from '@/core/providers/alpha-vantage-insights';

const querySchema = z.object({ symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()) });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ symbol: url.searchParams.get('symbol') ?? '' });
  if (!parsed.success) return NextResponse.json({ error: 'Ticker inválido.' }, { status: 400 });
  const provider = getInsightsProvider();
  if (!provider) return NextResponse.json({ error: 'Proveedor de noticias no configurado.' }, { status: 503 });

  try {
    const items = await provider.getNews(parsed.data.symbol);
    return NextResponse.json({ source: provider.id, symbol: parsed.data.symbol, items, cachedForHours: Number(process.env.ALPHA_VANTAGE_NEWS_CACHE_TTL_HOURS ?? '6') });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No fue posible obtener noticias.' }, { status: 502 });
  }
}
