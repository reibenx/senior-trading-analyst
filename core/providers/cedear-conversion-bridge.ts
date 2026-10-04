import type { CedearConversion, MarketStatus } from '@/core/domain/cedear';

interface BridgeConversionResponse {
  conversions?: CedearConversion[];
}

export interface CedearConversionProvider {
  readonly id: string;
  getConversions(symbols: string[]): Promise<CedearConversion[]>;
}

export interface CedearRatioRecord {
  symbol: string;
  underlyingSymbol: string;
  cedearsPerUnderlyingShare: number;
  updatedAt: string;
  source: string;
}

export interface LocalQuoteRecord {
  symbol: string;
  localPriceArs: number;
  localBidArs?: number;
  localAskArs?: number;
  marketStatus: MarketStatus;
  quoteTimestamp: string;
  source: string;
}

export interface CclSnapshot {
  cclArsPerUsd: number;
  updatedAt: string;
  source: string;
}

export interface CedearRatioProvider {
  readonly id: string;
  getRatios(symbols: string[]): Promise<CedearRatioRecord[]>;
}

export interface LocalQuoteProvider {
  readonly id: string;
  getQuotes(symbols: string[]): Promise<LocalQuoteRecord[]>;
}

export interface CclProvider {
  readonly id: string;
  getCcl(): Promise<CclSnapshot>;
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
    private readonly ccl: CclProvider,
  ) {}

  async getConversions(symbols: string[]): Promise<CedearConversion[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const [ratios, quotes, ccl] = await Promise.all([
      this.ratios.getRatios(normalized),
      this.quotes.getQuotes(normalized),
      this.ccl.getCcl(),
    ]);

    const ratioMap = new Map(ratios.map((item) => [item.symbol.toUpperCase(), item]));
    const quoteMap = new Map(quotes.map((item) => [item.symbol.toUpperCase(), item]));

    return normalized.flatMap((symbol) => {
      const ratio = ratioMap.get(symbol);
      const quote = quoteMap.get(symbol);
      if (!ratio || !quote) return [];

      return [{
        symbol,
        underlyingSymbol: ratio.underlyingSymbol,
        cedearsPerUnderlyingShare: ratio.cedearsPerUnderlyingShare,
        cclArsPerUsd: ccl.cclArsPerUsd,
        localPriceArs: quote.localPriceArs,
        localBidArs: quote.localBidArs,
        localAskArs: quote.localAskArs,
        marketStatus: quote.marketStatus,
        quoteTimestamp: quote.quoteTimestamp,
        updatedAt: [ratio.updatedAt, quote.quoteTimestamp, ccl.updatedAt].sort().at(0) ?? quote.quoteTimestamp,
        source: `${ratio.source}+${quote.source}+${ccl.source}`,
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
  const quoteUrl = process.env.IOL_QUOTE_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim();
  const cclUrl = process.env.CCL_BRIDGE_URL?.trim();
  if (!ratioUrl || !quoteUrl || !cclUrl) return null;

  return new CompositeCedearConversionProvider(
    new RatioBridgeProvider(ratioUrl, process.env.CEDEAR_RATIO_BRIDGE_TOKEN?.trim()),
    new QuoteBridgeProvider(quoteUrl, process.env.IOL_BRIDGE_TOKEN?.trim()),
    new CclBridgeProvider(cclUrl, process.env.CCL_BRIDGE_TOKEN?.trim()),
  );
}
