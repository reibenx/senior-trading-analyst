import type { CedearConversion } from '@/core/domain/cedear';

interface BridgeConversionResponse {
  conversions?: CedearConversion[];
}

export interface CedearConversionProvider {
  readonly id: string;
  getConversions(symbols: string[]): Promise<CedearConversion[]>;
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
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
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

export function getCedearConversionProvider(): CedearConversionProvider | null {
  const baseUrl = process.env.CEDEAR_CONVERSION_BRIDGE_URL?.trim();
  if (!baseUrl) return null;
  return new CedearConversionBridgeProvider(
    baseUrl,
    process.env.CEDEAR_CONVERSION_BRIDGE_TOKEN?.trim(),
  );
}
