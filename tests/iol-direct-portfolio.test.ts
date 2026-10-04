import { describe, expect, it } from 'vitest';
import { IolDirectApiAdapter, type IolJsonClient } from '@/core/providers/iol-direct';

class TestClient implements IolJsonClient {
  readonly calls: string[] = [];

  constructor(
    private readonly responses: Record<string, unknown>,
    private readonly failures = new Set<string>(),
  ) {}

  async requestJson<T>(path: string): Promise<T> {
    this.calls.push(path);
    if (this.failures.has(path)) throw new Error(`forced failure ${path}`);
    return this.responses[path] as T;
  }
}

describe('IolDirectApiAdapter', () => {
  it('prefers the v2 Argentina portfolio endpoint', async () => {
    const client = new TestClient({
      '/api/v2/portafolio/argentina': {
        activos: [{
          titulo: { simbolo: 'NVDA', moneda: 'peso_Argentino', mercado: 'bCBA', tipo: 'CEDEARS' },
          cantidad: 167,
          ultimoPrecio: 15850,
          valorizado: 2646950,
        }],
      },
    });

    const positions = await new IolDirectApiAdapter(client).getPositions();
    expect(client.calls).toEqual(['/api/v2/portafolio/argentina']);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      symbol: 'NVDA',
      quantity: 167,
      marketValue: 2646950,
      currency: 'ARS',
      market: 'bCBA',
      assetType: 'CEDEARS',
      broker: 'IOL',
    });
  });

  it('falls back to the legacy portfolio endpoint only when v2 fails', async () => {
    const client = new TestClient({
      '/api/micuenta/miportafolio': {
        portafolio: [{
          simbolo: 'GOOGL',
          cantidad: 122,
          ultimoPrecio: 9635,
          valorizado: 1175470,
          moneda: 'Peso_Argentino',
        }],
      },
    }, new Set(['/api/v2/portafolio/argentina']));

    const positions = await new IolDirectApiAdapter(client).getPositions();
    expect(client.calls).toEqual([
      '/api/v2/portafolio/argentina',
      '/api/micuenta/miportafolio',
    ]);
    expect(positions[0]).toMatchObject({
      symbol: 'GOOGL',
      quantity: 122,
      marketValue: 1175470,
      currency: 'ARS',
    });
  });
});
