import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getThesis2027HistoryStore } from '@/core/persistence/thesis-2027-history-store';

const querySchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ symbol: url.searchParams.get('symbol') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ticker inválido.' }, { status: 400 });
  }

  const store = getThesis2027HistoryStore();
  if (!store) {
    return NextResponse.json({ available: false, error: 'Persistent thesis history store is not configured' }, { status: 503 });
  }

  const history = await store.get(parsed.data.symbol).catch(() => null);
  return NextResponse.json({
    available: Boolean(history),
    symbol: parsed.data.symbol,
    history,
  });
}
