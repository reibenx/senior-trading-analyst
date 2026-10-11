import { NextResponse } from 'next/server';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';
import { getFundamentalProvider } from '@/core/providers/alpha-vantage-fundamentals';
import { getInsightsProvider } from '@/core/providers/alpha-vantage-insights';
import { getTelegramProvider } from '@/core/providers/telegram-notifications';
import { getWhatsAppProvider } from '@/core/providers/whatsapp-notifications';
import {
  buildPortfolioFingerprint,
  getPortfolioOpportunityStore,
} from '@/core/persistence/portfolio-opportunity-store';
import { buildDailyPortfolioReport, buildWhatsAppDailyBrief } from '@/core/services/daily-portfolio-report';

function authorized(request: Request): boolean {
  const expected = process.env.MONITOR_CRON_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

function maxReportSymbols() {
  const configured = Number(process.env.DAILY_REPORT_MAX_SYMBOLS ?? '5');
  if (!Number.isFinite(configured)) return 5;
  return Math.max(3, Math.min(8, Math.floor(configured)));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const broker = getBrokerAdapter();
  if (!broker) {
    return NextResponse.json({ error: 'IOL bridge is not configured' }, { status: 503 });
  }

  const positions = await broker.getPositions();
  const positive = positions
    .filter((position) => position.quantity > 0)
    .sort((a, b) => Math.max(0, b.marketValue ?? 0) - Math.max(0, a.marketValue ?? 0));

  const symbols = positive.slice(0, maxReportSymbols()).map((position) => position.symbol.toUpperCase());
  const fingerprint = buildPortfolioFingerprint(positions);
  const store = getPortfolioOpportunityStore();
  const ranking = store ? await store.getTransversalRanking(fingerprint).catch(() => null) : null;
  const cached = store
    ? await store.getMany('position', fingerprint, symbols).catch(() => new Map())
    : new Map();

  const fundamentalsProvider = getFundamentalProvider();
  const insightsProvider = getInsightsProvider();
  const total = positive.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);

  const assets = await Promise.all(symbols.map(async (symbol) => {
    const positionValue = positive
      .filter((position) => position.symbol.toUpperCase() === symbol)
      .reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);
    const [fundamentals, news] = await Promise.all([
      fundamentalsProvider
        ? fundamentalsProvider.getFundamentals(symbol).catch(() => null)
        : Promise.resolve(null),
      insightsProvider
        ? insightsProvider.getNews(symbol).catch(() => [])
        : Promise.resolve([]),
    ]);

    return {
      symbol,
      weightPercent: total > 0 ? (positionValue / total) * 100 : 0,
      ranking: ranking?.items.find((item) => item.symbol.toUpperCase() === symbol),
      opportunity: cached.get(symbol),
      fundamentals,
      news,
    };
  }));

  const generatedAt = new Date();
  const report = buildDailyPortfolioReport(positions, assets, generatedAt);
  const whatsappBrief = buildWhatsAppDailyBrief(positions, assets, generatedAt);

  const whatsapp = getWhatsAppProvider();
  const telegram = getTelegramProvider();
  const deliveries: Array<{ provider: string; ok: boolean; error?: string }> = [];

  if (whatsapp) {
    try {
      await whatsapp.sendDailyReport(whatsapp.dailyTemplateConfigured ? whatsappBrief : report);
      deliveries.push({ provider: whatsapp.id, ok: true });
    } catch (error) {
      deliveries.push({
        provider: whatsapp.id,
        ok: false,
        error: error instanceof Error ? error.message : 'WhatsApp delivery failed',
      });
    }
  }

  const sendTelegram = process.env.DAILY_REPORT_TELEGRAM?.trim().toLowerCase() === 'true';
  const whatsappSucceeded = deliveries.some((item) => item.provider === 'whatsapp-cloud' && item.ok);
  if (telegram && (sendTelegram || !whatsappSucceeded)) {
    try {
      await telegram.send({
        id: `daily-report:${generatedAt.toISOString()}`,
        symbol: 'PORTFOLIO',
        severity: 'INFO',
        type: 'DAILY_PORTFOLIO_REPORT',
        title: 'Senior Trading Analyst · Reporte diario',
        message: report,
        createdAt: generatedAt.toISOString(),
      });
      deliveries.push({ provider: telegram.id, ok: true });
    } catch (error) {
      deliveries.push({
        provider: telegram.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Telegram delivery failed',
      });
    }
  }

  const delivered = deliveries.some((item) => item.ok);
  return NextResponse.json({
    ok: delivered,
    generatedAt: generatedAt.toISOString(),
    symbols,
    report,
    whatsappBrief,
    deliveries,
  }, { status: delivered ? 200 : 503 });
}
