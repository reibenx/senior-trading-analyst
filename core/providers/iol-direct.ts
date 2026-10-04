import type { BrokerAdapter } from '@/core/adapters/contracts';
import type { Position } from '@/core/domain/trading';
import { getIolApiClient, type IolApiClient } from '@/core/providers/iol-api-client';

export interface IolJsonClient {
  requestJson<T>(path: string, init?: RequestInit): Promise<T>;
}

function currencyCode(value: unknown): string {
  if (typeof value !== 'string') return 'ARS';
  const normalized = value.toLowerCase();
  if (normalized.includes('dolar') || normalized.includes('usd')) return 'USD';
  return 'ARS';
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractAssetCandidates(payload: unknown): unknown[] {
  const output: unknown[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const titulo = record.titulo;
    const hasSymbol = typeof record.simbolo === 'string'
      || (titulo && typeof titulo === 'object' && typeof (titulo as Record<string, unknown>).simbolo === 'string');
    const hasQuantity = 'cantidad' in record;
    if (hasSymbol && hasQuantity) output.push(record);
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return output;
}

function normalizePosition(candidate: unknown): Position | null {
  const record = candidate as Record<string, unknown>;
  const titulo = record.titulo && typeof record.titulo === 'object'
    ? record.titulo as Record<string, unknown>
    : {};
  const symbol = String(record.simbolo ?? titulo.simbolo ?? '').toUpperCase();
  const quantity = toFiniteNumber(record.cantidad);
  const unitPrice = toFiniteNumber(
    record.ultimoPrecio
      ?? record.precio
      ?? record.precioUltimo
      ?? record.unitPrice,
  );
  const explicitMarketValue = toFiniteNumber(
    record.valorizado
      ?? record.valorizacion
      ?? record.marketValue,
  );
  const marketValue = explicitMarketValue > 0 ? explicitMarketValue : Math.max(0, quantity * unitPrice);
  const currency = currencyCode(record.moneda ?? titulo.moneda);
  const market = String(record.mercado ?? titulo.mercado ?? '').trim() || undefined;
  const assetType = String(record.tipo ?? record.tipoTitulo ?? titulo.tipo ?? '').trim() || undefined;

  if (!symbol || quantity === 0) return null;

  return {
    symbol,
    quantity,
    marketValue,
    currency,
    broker: 'IOL',
    market,
    assetType,
  } satisfies Position;
}

export class IolDirectApiAdapter implements BrokerAdapter {
  readonly id = 'iol-direct-api';

  constructor(private readonly client: IolJsonClient) {}

  private async getPortfolioPayload(): Promise<unknown> {
    try {
      return await this.client.requestJson<unknown>('/api/v2/portafolio/argentina');
    } catch {
      return this.client.requestJson<unknown>('/api/micuenta/miportafolio');
    }
  }

  async getPositions(): Promise<Position[]> {
    const payload = await this.getPortfolioPayload();
    return extractAssetCandidates(payload)
      .map(normalizePosition)
      .filter((position): position is Position => Boolean(position));
  }
}

export function getIolDirectApiAdapter(): IolDirectApiAdapter | null {
  const client: IolApiClient | null = getIolApiClient();
  return client ? new IolDirectApiAdapter(client) : null;
}
