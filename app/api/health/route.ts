import { NextResponse } from 'next/server';
import { getExecutionPolicy } from '@/core/execution/execution-policy';

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export async function GET() {
  const marketDataProvider = process.env.MARKET_DATA_PROVIDER?.trim() || 'auto';
  const ratioMode = process.env.CEDEAR_RATIO_PROVIDER?.trim().toLowerCase() || 'auto';
  const directIol = configured('IOL_API_USERNAME', 'IOL_API_PASSWORD');
  const bridgeIol = configured('IOL_BRIDGE_URL');
  const redisReady = configured('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  const metadataBridge = Boolean(
    process.env.IOL_ASSET_METADATA_BRIDGE_URL?.trim()
    || process.env.IOL_BRIDGE_URL?.trim(),
  );
  const allInOneCedear = configured('CEDEAR_CONVERSION_BRIDGE_URL');
  const quoteAvailable = directIol
    || Boolean(process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim());
  const ratioReady = ratioMode === 'bridge' ? configured('CEDEAR_RATIO_BRIDGE_URL') : true;
  const compositeCedear = ratioReady && quoteAvailable;
  const executionPolicy = getExecutionPolicy();
  const orderBridgeReady = Boolean(process.env.IOL_ORDER_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim());
  const confirmationSecretReady = (process.env.ORDER_CONFIRMATION_SECRET?.trim().length ?? 0) >= 24;

  const modules = {
    appAuth: configured('APP_ACCESS_USER', 'APP_ACCESS_PASSWORD'),
    marketData: marketDataProvider === 'demo'
      ? { ready: true, mode: 'demo' }
      : { ready: configured('TWELVE_DATA_API_KEY'), mode: marketDataProvider },
    fundamentals: { ready: configured('ALPHA_VANTAGE_API_KEY') },
    iolPortfolio: {
      ready: directIol || bridgeIol,
      mode: directIol ? 'direct-api' : bridgeIol ? 'bridge' : 'unconfigured',
    },
    iolQuotes: {
      ready: quoteAvailable,
      mode: directIol ? 'direct-api' : quoteAvailable ? 'bridge' : 'unconfigured',
    },
    iolAssetMetadata: {
      ready: metadataBridge,
      mode: metadataBridge ? 'bridge' : 'unconfigured',
      purpose: 'explicit ARS/D/cable related symbols',
    },
    cedearRatios: {
      ready: ratioReady,
      mode: ratioMode === 'bridge' ? 'bridge' : ratioMode === 'caja' ? 'caja-de-valores' : 'auto:caja+bridge-fallback',
      officialSource: ratioMode !== 'bridge',
    },
    iolOrders: {
      ready: executionPolicy.validationEnabled && orderBridgeReady,
      mode: executionPolicy.mode,
      validationEnabled: executionPolicy.validationEnabled,
      simulationEnabled: executionPolicy.simulationEnabled && confirmationSecretReady,
      placementEnabled: executionPolicy.placementEnabled,
      confirmationSecretReady,
      reason: executionPolicy.reason,
    },
    orderAudit: {
      ready: true,
      mode: configured('ORDER_AUDIT_BRIDGE_URL') ? 'bridge' : 'server-log',
    },
    activityHistory: {
      ready: redisReady,
      mode: redisReady ? 'redis-rest' : 'unconfigured',
      purpose: 'bounded history of alerts and sandbox/order audit events',
    },
    cedearConversion: {
      ready: allInOneCedear || compositeCedear,
      mode: allInOneCedear ? 'all-in-one' : compositeCedear ? 'composite' : 'unconfigured',
      impliedCableCcl: directIol && metadataBridge,
      globalCclBenchmark: configured('CCL_BRIDGE_URL'),
    },
    alertState: { ready: redisReady },
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
