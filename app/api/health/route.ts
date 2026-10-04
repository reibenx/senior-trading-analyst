import { NextResponse } from 'next/server';

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export async function GET() {
  const marketDataProvider = process.env.MARKET_DATA_PROVIDER?.trim() || 'auto';
  const allInOneCedear = configured('CEDEAR_CONVERSION_BRIDGE_URL');
  const compositeCedear = configured('CEDEAR_RATIO_BRIDGE_URL')
    && Boolean(process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim());

  const modules = {
    appAuth: configured('APP_ACCESS_USER', 'APP_ACCESS_PASSWORD'),
    marketData: marketDataProvider === 'demo'
      ? { ready: true, mode: 'demo' }
      : { ready: configured('TWELVE_DATA_API_KEY'), mode: marketDataProvider },
    fundamentals: { ready: configured('ALPHA_VANTAGE_API_KEY') },
    iolPortfolio: { ready: configured('IOL_BRIDGE_URL') },
    iolOrders: { ready: Boolean(process.env.IOL_ORDER_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim()) },
    cedearConversion: {
      ready: allInOneCedear || compositeCedear,
      mode: allInOneCedear ? 'all-in-one' : compositeCedear ? 'composite' : 'unconfigured',
      globalCclFallback: configured('CCL_BRIDGE_URL'),
    },
    alertState: { ready: configured('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN') },
    telegram: { ready: configured('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID') },
    whatsapp: { ready: configured('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_RECIPIENT') },
    monitorCron: { ready: configured('MONITOR_CRON_TOKEN') },
  };

  const criticalReady = modules.marketData.ready && modules.iolPortfolio.ready;

  return NextResponse.json({
    ok: true,
    criticalReady,
    generatedAt: new Date().toISOString(),
    modules,
  });
}
