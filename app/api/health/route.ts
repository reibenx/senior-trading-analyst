import { NextResponse } from 'next/server';
import { getExecutionPolicy } from '@/core/execution/execution-policy';

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export async function GET() {
  const marketDataProvider = process.env.MARKET_DATA_PROVIDER?.trim() || 'auto';
  const directIol = configured('IOL_API_USERNAME', 'IOL_API_PASSWORD');
  const bridgeIol = configured('IOL_BRIDGE_URL');
  const metadataBridge = Boolean(
    process.env.IOL_ASSET_METADATA_BRIDGE_URL?.trim()
    || process.env.IOL_BRIDGE_URL?.trim(),
  );
  const allInOneCedear = configured('CEDEAR_CONVERSION_BRIDGE_URL');
  const quoteAvailable = directIol
    || Boolean(process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim());
  const compositeCedear = configured('CEDEAR_RATIO_BRIDGE_URL') && quoteAvailable;
  const executionPolicy = getExecutionPolicy();

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
    iolOrders: {
      ready: executionPolicy.validationEnabled
        && Boolean(process.env.IOL_ORDER_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim()),
      mode: executionPolicy.mode,
      validationEnabled: executionPolicy.validationEnabled,
      placementEnabled: executionPolicy.placementEnabled,
      reason: executionPolicy.reason,
    },
    cedearConversion: {
      ready: allInOneCedear || compositeCedear,
      mode: allInOneCedear ? 'all-in-one' : compositeCedear ? 'composite' : 'unconfigured',
      impliedCableCcl: directIol && metadataBridge,
      globalCclBenchmark: configured('CCL_BRIDGE_URL'),
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
