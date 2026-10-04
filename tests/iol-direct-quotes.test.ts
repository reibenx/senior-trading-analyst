import { describe, expect, it } from 'vitest';
import {
  IolDirectQuoteProvider,
  type IolQuoteJsonClient,
} from '@/core/providers/iol-direct-quotes';

class TestQuoteClient implements IolQuoteJsonClient {
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

describe('IolDirectQuoteProvider', () => {
  it('uses CotizacionDetalle when available', async () => {
    const detail = '/api/v2/bCBA/Titulos/NVDA/CotizacionDetalle';
    const client = new TestQuoteClient({
      [detail]: {
        ultimoPrecio: 15850,
        fechaHora: new Date().toISOString(),
        puntaCompra: 15840,
        puntaVenta: 15860,
      },
    });

    const [quote] = await new IolDirectQuoteProvider(client).getQuotes(['NVDA']);
    expect(client.calls).toEqual([detail]);
    expect(quote).toMatchObject({
      symbol: 'NVDA',
      localPriceArs: 15850,
      localBidArs: 15840,
      localAskArs: 15860,
      marketStatus: 'OPEN',
    });
  });

  it('falls back to Cotizacion if CotizacionDetalle fails', async () => {
    const detail = '/api/v2/bCBA/Titulos/NVDA/CotizacionDetalle';
    const fallback = '/api/v2/bCBA/Titulos/NVDA/Cotizacion';
    const client = new TestQuoteClient({
      [fallback]: {
        ultimoPrecio: 15850,
        fechaHora: new Date().toISOString(),
        precioCompra: 15840,
        precioVenta: 15860,
      },
    }, new Set([detail]));

    const [quote] = await new IolDirectQuoteProvider(client).getQuotes(['NVDA']);
    expect(client.calls).toEqual([detail, fallback]);
    expect(quote.localPriceArs).toBe(15850);
  });
});
