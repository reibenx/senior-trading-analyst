import type { CedearConversion } from '@/core/domain/cedear';
import type {
  CclProvider,
  CclSnapshot,
  CedearConversionProvider,
  CedearRatioProvider,
  CedearRatioRecord,
  LocalQuoteProvider,
  LocalQuoteRecord,
} from '@/core/providers/cedear-provider-contracts';
import { CajaDeValoresRatioProvider } from '@/core/providers/caja-de-valores-ratios';
import { getIolDirectQuoteProvider } from '@/core/providers/iol-direct-quotes';

interface BridgeConversionResponse {
  conversions?: CedearConversion[];
}

function authHeaders(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function pctDeviation(value: number, reference: number): number {
  if (reference <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs((value - reference) / reference) * 100;
}

function oldestMarketTimestamp(quoteTimestamp: string, cclTimestamp?: string): string {
  const timestamps = [quoteTimestamp, cclTimestamp]
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value as string)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return timestamps[0] ?? quoteTimestamp;
}

export class CedearConversionBridgeProvider implements CedearConversionProvider {
  readonly id = 'cedear-conversion-bridge';

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async getConversions(symbols: string[]): Promise<CedearConversion[]> {
    const url = new URL('/cedears/conversions', this.baseUrl);
    url.searchParams.set('symbols', [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].join(','));

    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(this.token),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`CEDEAR conversion bridge error: HTTP ${response.status}`);

    const payload = await response.json() as BridgeConversionResponse;
    return (payload.conversions ?? []).filter((item) => (
      item.symbol
      && item.underlyingSymbol
      && item.cedearsPerUnderlyingShare > 0
      && item.cclArsPerUsd > 0
      && (item.localPriceArs ?? 0) > 0
      && item.updatedAt
    ));
  }
}

class RatioBridgeProvider implements CedearRatioProvider {
  readonly id = 'cedear-ratio-bridge';
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  async getRatios(symbols: string[]): Promise<CedearRatioRecord[]> {
    const url = new URL('/cedears/ratios', this.baseUrl);
    url.searchParams.set('symbols', [...new Set(symbols.map((s) => s.toUpperCase()))].join(','));
    const response = await fetch(url, { headers: authHeaders(this.token), cache: 'no-store' });
    if (!response.ok) throw new Error(`CEDEAR ratio bridge error: HTTP ${response.status}`);
    const payload = await response.json() as { ratios?: CedearRatioRecord[] };
    return (payload.ratios ?? []).filter((item) => item.cedearsPerUnderlyingShare > 0 && item.symbol);
  }
}

class FallbackRatioProvider implements CedearRatioProvider {
  readonly id = 'cedear-ratio-fallback';

  constructor(
    private readonly primary: CedearRatioProvider,
    private readonly fallback?: CedearRatioProvider,
  ) {}

  async getRatios(symbols: string[]): Promise<CedearRatioRecord[]> {
    try {
      const primary = await this.primary.getRatios(symbols);
      const bySymbol = new Map(primary.map((item) => [item.symbol.toUpperCase(), item]));
      const missing = symbols.filter((symbol) => !bySymbol.has(symbol.toUpperCase()));
      if (missing.length && this.fallback) {
        for (const item of await this.fallback.getRatios(missing)) {
          bySymbol.set(item.symbol.toUpperCase(), item);
        }
      }
      return [...bySymbol.values()];
    } catch (error) {
      if (!this.fallback) throw error;
      return this.fallback.getRatios(symbols);
    }
  }
}

class QuoteBridgeProvider implements LocalQuoteProvider {
  readonly id = 'iol-quote-bridge';
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  async getQuotes(symbols: string[]): Promise<LocalQuoteRecord[]> {
    const url = new URL('/quotes', this.baseUrl);
    url.searchParams.set('market', 'BCBA');
    url.searchParams.set('term', 't1');
    url.searchParams.set('includeCable', 'true');
    url.searchParams.set('symbols', [...new Set(symbols.map((s) => s.toUpperCase()))].join(','));
    const response = await fetch(url, { headers: authHeaders(this.token), cache: 'no-store' });
    if (!response.ok) throw new Error(`IOL quote bridge error: HTTP ${response.status}`);
    const payload = await response.json() as { quotes?: LocalQuoteRecord[] };
    return (payload.quotes ?? []).filter((item) => item.localPriceArs > 0 && item.symbol && item.quoteTimestamp);
  }
}

class CclBridgeProvider implements CclProvider {
  readonly id = 'ccl-bridge';
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  async getCcl(): Promise<CclSnapshot> {
    const url = new URL('/fx/ccl', this.baseUrl);
    const response = await fetch(url, { headers: authHeaders(this.token), cache: 'no-store' });
    if (!response.ok) throw new Error(`CCL bridge error: HTTP ${response.status}`);
    const payload = await response.json() as CclSnapshot;
    if (!(payload.cclArsPerUsd > 0) || !payload.updatedAt) throw new Error('CCL bridge returned an invalid snapshot');
    return payload;
  }
}

function getRatioProvider(): CedearRatioProvider {
  const mode = process.env.CEDEAR_RATIO_PROVIDER?.trim().toLowerCase() || 'auto';
  const bridgeUrl = process.env.CEDEAR_RATIO_BRIDGE_URL?.trim();
  const bridge = bridgeUrl
    ? new RatioBridgeProvider(bridgeUrl, process.env.CEDEAR_RATIO_BRIDGE_TOKEN?.trim())
    : undefined;

  if (mode === 'bridge' && bridge) return bridge;
  if (mode === 'bridge' && !bridge) throw new Error('CEDEAR_RATIO_PROVIDER=bridge but CEDEAR_RATIO_BRIDGE_URL is missing');

  const caja = new CajaDeValoresRatioProvider(
    process.env.CEDEAR_CAJA_URL?.trim() || 'https://cajadevalores.com.ar/Servicios/Cedears',
  );
  return mode === 'caja' ? caja : new FallbackRatioProvider(caja, bridge);
}

export class CompositeCedearConversionProvider implements CedearConversionProvider {
  readonly id = 'composite-cedear-conversion';

  constructor(
    private readonly ratios: CedearRatioProvider,
    private readonly quotes: LocalQuoteProvider,
    private readonly ccl?: CclProvider,
  ) {}

  async getConversions(symbols: string[]): Promise<CedearConversion[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const [ratios, quotes, globalCcl] = await Promise.all([
      this.ratios.getRatios(normalized),
      this.quotes.getQuotes(normalized),
      this.ccl ? this.ccl.getCcl().catch(() => undefined) : Promise.resolve(undefined),
    ]);

    const ratioMap = new Map(ratios.map((item) => [item.symbol.toUpperCase(), item]));
    const quoteMap = new Map(quotes.map((item) => [item.symbol.toUpperCase(), item]));

    return normalized.flatMap((symbol) => {
      const ratio = ratioMap.get(symbol);
      const quote = quoteMap.get(symbol);
      const impliedCcl = quote?.impliedCclArsPerUsd && quote.impliedCclArsPerUsd > 0
        ? quote.impliedCclArsPerUsd
        : undefined;
      const cclValue = impliedCcl ?? globalCcl?.cclArsPerUsd;
      if (!ratio || !quote || !cclValue) return [];

      const usingImplied = impliedCcl !== undefined;
      const benchmarkDeviation = usingImplied && globalCcl?.cclArsPerUsd
        ? pctDeviation(impliedCcl, globalCcl.cclArsPerUsd)
        : undefined;

      // Ratio freshness is tracked separately. Market freshness must only be
      // constrained by the quote and by the global CCL when it is actually used.
      const marketUpdatedAt = oldestMarketTimestamp(
        quote.quoteTimestamp,
        !usingImplied ? globalCcl?.updatedAt : undefined,
      );
      const cclSourceDescription = usingImplied
        ? `${quote.source}:implied-cable`
        : globalCcl?.source ?? 'unknown-ccl';

      return [{
        symbol,
        underlyingSymbol: ratio.underlyingSymbol,
        cedearsPerUnderlyingShare: ratio.cedearsPerUnderlyingShare,
        ratioUpdatedAt: ratio.updatedAt,
        cclArsPerUsd: cclValue,
        benchmarkCclArsPerUsd: globalCcl?.cclArsPerUsd,
        cclBenchmarkDeviationPercent: benchmarkDeviation,
        cclSource: usingImplied ? 'IMPLIED_CABLE' : 'GLOBAL_BENCHMARK',
        cableSymbol: quote.cableSymbol,
        localPriceArs: quote.localPriceArs,
        localBidArs: quote.localBidArs,
        localAskArs: quote.localAskArs,
        marketStatus: quote.marketStatus,
        quoteTimestamp: quote.quoteTimestamp,
        updatedAt: marketUpdatedAt,
        source: `${ratio.source}+${quote.source}+${cclSourceDescription}`,
      } satisfies CedearConversion];
    });
  }
}

export function getCedearConversionProvider(): CedearConversionProvider | null {
  const allInOneUrl = process.env.CEDEAR_CONVERSION_BRIDGE_URL?.trim();
  if (allInOneUrl) {
    return new CedearConversionBridgeProvider(
      allInOneUrl,
      process.env.CEDEAR_CONVERSION_BRIDGE_TOKEN?.trim(),
    );
  }

  const directQuotes = getIolDirectQuoteProvider();
  const quoteUrl = process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim();
  const quoteProvider: LocalQuoteProvider | null = directQuotes
    ?? (quoteUrl ? new QuoteBridgeProvider(quoteUrl, process.env.IOL_BRIDGE_TOKEN?.trim()) : null);
  if (!quoteProvider) return null;

  const cclUrl = process.env.CCL_BRIDGE_URL?.trim();
  return new CompositeCedearConversionProvider(
    getRatioProvider(),
    quoteProvider,
    cclUrl ? new CclBridgeProvider(cclUrl, process.env.CCL_BRIDGE_TOKEN?.trim()) : undefined,
  );
}

export type {
  CclProvider,
  CclSnapshot,
  CedearConversionProvider,
  CedearRatioProvider,
  CedearRatioRecord,
  LocalQuoteProvider,
  LocalQuoteRecord,
} from '@/core/providers/cedear-provider-contracts';
