import { beforeEach, describe, expect, it } from 'vitest';
import {
  IolDirectAssetMetadataProvider,
  resetIolAssetMetadataCacheForTests,
  type IolAssetMetadataJsonClient,
} from '@/core/providers/iol-asset-metadata';

class TestClient implements IolAssetMetadataJsonClient {
  readonly calls: string[] = [];

  constructor(private readonly existing: Set<string>) {}

  async requestJson<T>(path: string): Promise<T> {
    this.calls.push(path);
    const match = path.match(/Titulos\/([^/]+)\/Cotizacion$/);
    const symbol = match?.[1];
    if (!symbol || !this.existing.has(symbol)) throw new Error('not found');
    return {} as T;
  }
}

describe('IolDirectAssetMetadataProvider', () => {
  beforeEach(() => resetIolAssetMetadataCacheForTests());

  it('returns only D/C species actually confirmed by IOL', async () => {
    const client = new TestClient(new Set(['NVDAD', 'NVDAC']));
    const [metadata] = await new IolDirectAssetMetadataProvider(client).getMetadata(['nvda']);

    expect(metadata).toMatchObject({
      symbol: 'NVDA',
      arsSymbol: 'NVDA',
      dollarSymbol: 'NVDAD',
      cableSymbol: 'NVDAC',
      source: 'iol-direct-api:validated-related-symbols',
    });
    expect(client.calls).toHaveLength(2);
  });

  it('does not invent unavailable cable species and caches the result', async () => {
    const client = new TestClient(new Set(['NVDAD']));
    const provider = new IolDirectAssetMetadataProvider(client);
    const [first] = await provider.getMetadata(['NVDA']);
    const [second] = await provider.getMetadata(['NVDA']);

    expect(first.dollarSymbol).toBe('NVDAD');
    expect(first.cableSymbol).toBeUndefined();
    expect(second).toEqual(first);
    expect(client.calls).toHaveLength(2);
  });
});
