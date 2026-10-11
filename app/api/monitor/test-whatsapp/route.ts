import { NextResponse } from 'next/server';
import { getWhatsAppConfigurationStatus, getWhatsAppProvider } from '@/core/providers/whatsapp-notifications';

function authorized(request: Request): boolean {
  const expected = process.env.MONITOR_CRON_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = getWhatsAppConfigurationStatus();
  if (!status.ready) {
    return NextResponse.json({
      error: 'WhatsApp is not configured',
      missing: status.missing,
      dailyReportReady: status.dailyReportReady,
    }, { status: 503 });
  }

  const whatsapp = getWhatsAppProvider();
  if (!whatsapp) {
    return NextResponse.json({ error: 'WhatsApp provider unavailable' }, { status: 503 });
  }

  const now = new Date().toISOString();
  await whatsapp.sendText(
    '✅ Senior Trading Analyst · WhatsApp OK\nCanal operativo para alertas. El reporte diario requiere además una plantilla aprobada de Meta.',
  );

  return NextResponse.json({
    ok: true,
    provider: whatsapp.id,
    sentAt: now,
    dailyReportReady: status.dailyReportReady,
    dailyTemplateConfigured: status.dailyTemplateConfigured,
  });
}
