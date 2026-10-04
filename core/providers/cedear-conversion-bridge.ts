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
import { getIolDirectQuoteProvider } from '@/core/providers/iol-direct-quotes';

interface BridgeConversionResponse {
  conversions?: CedearConversion[];
}

function authHeaders(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
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
      this.ccl ? this.ccl.getCcl() : Promise.resolve(undefined),
    ]);

    const ratioMap = new Map(ratios.map((item) => [item.symbol.toUpperCase(), item]));
    const quoteMap = new Map(quotes.map((item) => [item.symbol.toUpperCase(), item]));

    return normalized.flatMap((symbol) => {
      const ratio = ratioMap.get(symbol);
      const quote = quoteMap.get(symbol);
      const cclValue = quote?.impliedCclArsPerUsd && quote.impliedCclArsPerUsd > 0
        ? quote.impliedCclArsPerUsd
        : globalCcl?.cclArsPerUsd;
      if (!ratio || !quote || !cclValue) return [];

      const timestamps = [ratio.updatedAt, quote.quoteTimestamp];
      if (globalCcl?.updatedAt && !quote.impliedCclArsPerUsd) timestamps.push(globalCcl.updatedAt);
      const oldestTimestamp = [...timestamps].sort()[0] ?? quote.quoteTimestamp;
      const cclSource = quote.impliedCclArsPerUsd ? `${quote.source}:implied-cable` : globalCcl?.source ?? 'unknown-ccl';

      return [{
        symbol,
        underlyingSymbol: ratio.underlyingSymbol,
        cedearsPerUnderlyingShare: ratio.cedearsPerUnderlyingShare,
        cclArsPerUsd: cclValue,
        localPriceArs: quote.localPriceArs,
        localBidArs: quote.localBidArs,
        localAskArs: quote.localAskArs,
        marketStatus: quote.marketStatus,
        quoteTimestamp: quote.quoteTimestamp,
        updatedAt: oldestTimestamp,
        source: `${ratio.source}+${quote.source}+${cclSource}`,
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

  const ratioUrl = process.env.CEDEAR_RATIO_BRIDGE_URL?.trim();
  if (!ratioUrl) return null;

  const directQuotes = getIolDirectQuoteProvider();
  const quoteUrl = process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim();
  const quoteProvider: LocalQuoteProvider | null = directQuotes
    ?? (quoteUrl ? new QuoteBridgeProvider(quoteUrl, process.env.IOL_BRIDGE_TOKEN?.trim()) : null);
  if (!quoteProvider) return null;

  const cclUrl = process.env.CCL_BRIDGE_URL?.trim();
  return new CompositeCedearConversionProvider(
    new RatioBridgeProvider(ratioUrl, process.env.CEDEAR_RATIO_BRIDGE_TOKEN?.trim()),
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
