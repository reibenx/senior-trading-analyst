import { NextResponse } from 'next/server';
import { getActivityStore } from '@/core/persistence/activity-store';

export async function GET(request: Request) {
  const store = getActivityStore();
  if (!store) {
    return NextResponse.json({
      configured: false,
      records: [],
      message: 'Activity persistence is not configured.',
    });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 100;
  const kind = url.searchParams.get('kind')?.trim().toUpperCase();
  const symbol = url.searchParams.get('symbol')?.trim().toUpperCase();

  const records = (await store.list(limit)).filter((record) => {
    if (kind && record.kind !== kind) return false;
    if (symbol && record.symbol?.toUpperCase() !== symbol) return false;
    return true;
  });

  return NextResponse.json({
    configured: true,
    count: records.length,
    records,
  });
}
