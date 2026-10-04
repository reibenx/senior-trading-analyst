import { NextResponse } from 'next/server';
import { getTelegramProvider } from '@/core/providers/telegram-notifications';

function authorized(request: Request): boolean {
  const expected = process.env.MONITOR_CRON_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const telegram = getTelegramProvider();
  if (!telegram) {
    return NextResponse.json({ error: 'Telegram is not configured' }, { status: 503 });
  }

  const now = new Date().toISOString();
  await telegram.send({
    id: `telegram-test:${now}`,
    symbol: 'SYSTEM',
    severity: 'INFO',
    type: 'NOTIFICATION_TEST',
    title: 'Senior Trading Analyst · Telegram OK',
    message: 'Prueba de notificación completada correctamente. El canal Telegram quedó operativo para alertas del monitor.',
    createdAt: now,
    metadata: { source: 'manual-test' },
  });

  return NextResponse.json({ ok: true, provider: 'telegram', sentAt: now });
}
