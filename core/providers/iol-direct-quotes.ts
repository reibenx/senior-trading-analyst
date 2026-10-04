import type { LocalQuoteProvider, LocalQuoteRecord } from '@/core/providers/cedear-provider-contracts';
import { getIolApiClient, type IolApiClient } from '@/core/providers/iol-api-client';

interface IolQuoteResponse {
  ultimoPrecio?: number;
  fechaHora?: string;
  puntaCompra?: number;
  puntaVenta?: number;
  precioCompra?: number;
  precioVenta?: number;
  puntas?: unknown;
  moneda?: string;
}

function finite(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function findPriceByKeys(value: unknown, keys: string[]): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPriceByKeys(item, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const found = finite(record[key]);
    if (found !== undefined) return found;
  }
  for (const child of Object.values(record)) {
    const found = findPriceByKeys(child, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function marketStatus(timestamp: string, bid?: number, ask?: number): LocalQuoteRecord['marketStatus'] {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'UNKNOWN';
  const fresh = Math.abs(Date.now() - parsed) <= 180_000;
  if (fresh && (bid !== undefined || ask !== undefined)) return 'OPEN';
  return 'UNKNOWN';
}

export class IolDirectQuoteProvider implements LocalQuoteProvider {
  readonly id = 'iol-direct-quotes';

  constructor(private readonly client: IolApiClient) {}

  async getQuotes(symbols: string[]): Promise<LocalQuoteRecord[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const results = await Promise.allSettled(normalized.map(async (symbol) => {
      const payload = await this.client.requestJson<IolQuoteResponse>(
        `/api/v2/bCBA/Titulos/${encodeURIComponent(symbol)}/CotizacionDetalle`,
      );
      const localPriceArs = finite(payload.ultimoPrecio);
      const quoteTimestamp = payload.fechaHora;
      if (!localPriceArs || !quoteTimestamp) throw new Error(`Invalid IOL quote payload for ${symbol}`);

      const bid = finite(payload.puntaCompra)
        ?? finite(payload.precioCompra)
        ?? findPriceByKeys(payload.puntas, ['precioCompra', 'precio', 'compra']);
      const ask = finite(payload.puntaVenta)
        ?? finite(payload.precioVenta)
        ?? findPriceByKeys(payload.puntas, ['precioVenta', 'precio', 'venta']);

      return {
        symbol,
        localPriceArs,
        localBidArs: bid,
        localAskArs: ask,
        marketStatus: marketStatus(quoteTimestamp, bid, ask),
        quoteTimestamp,
        source: 'iol-direct-api',
      } satisfies LocalQuoteRecord;
    }));

    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  }
}

export function getIolDirectQuoteProvider(): IolDirectQuoteProvider | null {
  const client = getIolApiClient();
  return client ? new IolDirectQuoteProvider(client) : null;
}
