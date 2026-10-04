import type {
  CedearAssetMetadata,
  CedearAssetMetadataProvider,
} from '@/core/providers/cedear-provider-contracts';

function authHeaders(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
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
  const baseUrl = process.env.IOL_ASSET_METADATA_BRIDGE_URL?.trim()
    || process.env.IOL_BRIDGE_URL?.trim();
  if (!baseUrl) return null;
  return new IolAssetMetadataBridgeProvider(
    baseUrl,
    process.env.IOL_ASSET_METADATA_BRIDGE_TOKEN?.trim()
      || process.env.IOL_BRIDGE_TOKEN?.trim(),
  );
}
