import type {
  CedearAssetMetadata,
  CedearAssetMetadataProvider,
} from '@/core/providers/cedear-provider-contracts';
import { getIolApiClient } from '@/core/providers/iol-api-client';

function authHeaders(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export interface IolAssetMetadataJsonClient {
  requestJson<T>(path: string, init?: RequestInit): Promise<T>;
}

interface CacheEntry {
  value: CedearAssetMetadata;
  expiresAt: number;
}

const metadataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function symbolExists(client: IolAssetMetadataJsonClient, symbol: string): Promise<boolean> {
  const encoded = encodeURIComponent(symbol);
  try {
    await client.requestJson<unknown>(`/api/v2/bCBA/Titulos/${encoded}/Cotizacion`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the related ARS / D / C species directly against IOL.
 *
 * We deliberately do not trust the ticker suffix convention by itself: D and C
 * candidates are only returned after IOL confirms that the quote endpoint exists.
 * This keeps the metadata usable for CEDEAR execution without inventing symbols.
 */
export class IolDirectAssetMetadataProvider implements CedearAssetMetadataProvider {
  readonly id = 'iol-direct-asset-metadata';

  constructor(private readonly client: IolAssetMetadataJsonClient) {}

  async getMetadata(symbols: string[]): Promise<CedearAssetMetadata[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const now = Date.now();

    const results = await Promise.all(normalized.map(async (symbol) => {
      const cached = metadataCache.get(symbol);
      if (cached && cached.expiresAt > now) return cached.value;

      const [hasDollar, hasCable] = await Promise.all([
        symbolExists(this.client, `${symbol}D`),
        symbolExists(this.client, `${symbol}C`),
      ]);

      const value: CedearAssetMetadata = {
        symbol,
        arsSymbol: symbol,
        dollarSymbol: hasDollar ? `${symbol}D` : undefined,
        cableSymbol: hasCable ? `${symbol}C` : undefined,
        updatedAt: new Date().toISOString(),
        source: 'iol-direct-api:validated-related-symbols',
      };
      metadataCache.set(symbol, { value, expiresAt: now + CACHE_TTL_MS });
      return value;
    }));

    return results;
  }
}

export class IolAssetMetadataBridgeProvider implements CedearAssetMetadataProvider {
  readonly id = 'iol-asset-metadata-bridge';

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async getMetadata(symbols: string[]): Promise<CedearAssetMetadata[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const url = new URL('/assets/info', this.baseUrl);
    url.searchParams.set('market', 'BCBA');
    url.searchParams.set('symbols', normalized.join(','));

    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(this.token),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`IOL asset metadata bridge error: HTTP ${response.status}`);

    const payload = await response.json() as { assets?: CedearAssetMetadata[] };
    return (payload.assets ?? []).filter((item) => (
      item.symbol
      && item.updatedAt
      && (item.arsSymbol || item.dollarSymbol || item.cableSymbol)
    ));
  }
}

export function getIolAssetMetadataProvider(): CedearAssetMetadataProvider | null {
  const direct = getIolApiClient();
  if (direct) return new IolDirectAssetMetadataProvider(direct);

  const baseUrl = process.env.IOL_ASSET_METADATA_BRIDGE_URL?.trim()
    || process.env.IOL_BRIDGE_URL?.trim();
  if (!baseUrl) return null;
  return new IolAssetMetadataBridgeProvider(
    baseUrl,
    process.env.IOL_ASSET_METADATA_BRIDGE_TOKEN?.trim()
      || process.env.IOL_BRIDGE_TOKEN?.trim(),
  );
}

export function resetIolAssetMetadataCacheForTests() {
  metadataCache.clear();
}
