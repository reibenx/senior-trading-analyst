import type {
  CedearAssetMetadataProvider,
  LocalQuoteProvider,
  LocalQuoteRecord,
} from '@/core/providers/cedear-provider-contracts';
import { getIolApiClient, type IolApiClient } from '@/core/providers/iol-api-client';
import { getIolAssetMetadataProvider } from '@/core/providers/iol-asset-metadata';

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

interface ParsedQuote {
  price: number;
  timestamp: string;
  bid?: number;
  ask?: number;
}

function finite(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function calculateImpliedCcl(localPriceArs: number, cablePriceUsd: number): number | undefined {
  if (!Number.isFinite(localPriceArs) || !Number.isFinite(cablePriceUsd)) return undefined;
  if (localPriceArs <= 0 || cablePriceUsd <= 0) return undefined;
  return localPriceArs / cablePriceUsd;
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

function oldestTimestamp(...timestamps: Array<string | undefined>): string {
  const valid = timestamps
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value as string)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return valid[0] ?? new Date(0).toISOString();
}

export class IolDirectQuoteProvider implements LocalQuoteProvider {
  readonly id = 'iol-direct-quotes';

  constructor(
    private readonly client: IolApiClient,
    private readonly metadataProvider?: CedearAssetMetadataProvider,
  ) {}

  private async fetchQuote(symbol: string): Promise<ParsedQuote> {
    const payload = await this.client.requestJson<IolQuoteResponse>(
      `/api/v2/bCBA/Titulos/${encodeURIComponent(symbol)}/CotizacionDetalle`,
    );
    const price = finite(payload.ultimoPrecio);
    const timestamp = payload.fechaHora;
    if (!price || !timestamp) throw new Error(`Invalid IOL quote payload for ${symbol}`);

    const bid = finite(payload.puntaCompra)
      ?? finite(payload.precioCompra)
      ?? findPriceByKeys(payload.puntas, ['precioCompra', 'precio', 'compra']);
    const ask = finite(payload.puntaVenta)
      ?? finite(payload.precioVenta)
      ?? findPriceByKeys(payload.puntas, ['precioVenta', 'precio', 'venta']);

    return { price, timestamp, bid, ask };
  }

  async getQuotes(symbols: string[]): Promise<LocalQuoteRecord[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    const metadata = this.metadataProvider
      ? await this.metadataProvider.getMetadata(normalized).catch(() => [])
      : [];
    const metadataMap = new Map(metadata.map((item) => [item.symbol.toUpperCase(), item]));

    const results = await Promise.allSettled(normalized.map(async (symbol) => {
      const local = await this.fetchQuote(symbol);
      const asset = metadataMap.get(symbol);
      const cableSymbol = asset?.cableSymbol?.toUpperCase();

      let impliedCclArsPerUsd: number | undefined;
      let effectiveTimestamp = local.timestamp;
      let source = 'iol-direct-api';

      if (cableSymbol) {
        try {
          const cable = await this.fetchQuote(cableSymbol);
          impliedCclArsPerUsd = calculateImpliedCcl(local.price, cable.price);
          effectiveTimestamp = oldestTimestamp(local.timestamp, cable.timestamp);
          source = `iol-direct-api:${symbol}/${cableSymbol}`;
        } catch {
          // A missing cable quote must not break the ARS quote. The composite
          // provider can still use a global CCL fallback.
        }
      }

      return {
        symbol,
        localPriceArs: local.price,
        localBidArs: local.bid,
        localAskArs: local.ask,
        impliedCclArsPerUsd,
        cableSymbol,
        marketStatus: marketStatus(effectiveTimestamp, local.bid, local.ask),
        quoteTimestamp: effectiveTimestamp,
        source,
      } satisfies LocalQuoteRecord;
    }));

    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  }
}

export function getIolDirectQuoteProvider(): IolDirectQuoteProvider | null {
  const client = getIolApiClient();
  if (!client) return null;
  return new IolDirectQuoteProvider(client, getIolAssetMetadataProvider() ?? undefined);
}
