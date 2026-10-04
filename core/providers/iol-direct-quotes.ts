import type { LocalQuoteProvider, LocalQuoteRecord } from '@/core/providers/cedear-conversion-bridge';
import { getIolApiClient, type IolApiClient } from '@/core/providers/iol-api-client';

interface IolQuoteResponse {
  ultimoPrecio?: number;
  fechaHora?: string;
  puntaCompra?: number;
  puntaVenta?: number;
  moneda?: string;
}

function finite(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
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

      return {
        symbol,
        localPriceArs,
        localBidArs: finite(payload.puntaCompra),
        localAskArs: finite(payload.puntaVenta),
        marketStatus: 'UNKNOWN',
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
