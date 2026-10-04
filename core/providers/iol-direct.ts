import type { BrokerAdapter } from '@/core/adapters/contracts';
import type { Position } from '@/core/domain/trading';
import { getIolApiClient, type IolApiClient } from '@/core/providers/iol-api-client';

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

export class IolDirectApiAdapter implements BrokerAdapter {
  readonly id = 'iol-direct-api';

  constructor(private readonly client: IolApiClient) {}

  async getPositions(): Promise<Position[]> {
    const payload = await this.client.requestJson<unknown>('/api/micuenta/miportafolio');
    return extractAssetCandidates(payload)
      .map((candidate) => {
        const record = candidate as Record<string, unknown>;
        const titulo = record.titulo && typeof record.titulo === 'object'
          ? record.titulo as Record<string, unknown>
          : {};
        const symbol = String(record.simbolo ?? titulo.simbolo ?? '').toUpperCase();
        const quantity = toFiniteNumber(record.cantidad);
        const unitPrice = toFiniteNumber(record.ultimoPrecio ?? record.precio ?? record.unitPrice);
        const explicitMarketValue = toFiniteNumber(record.valorizado ?? record.marketValue);
        const marketValue = explicitMarketValue > 0 ? explicitMarketValue : Math.max(0, quantity * unitPrice);
        const currency = currencyCode(record.moneda ?? titulo.moneda);

        return {
          symbol,
          quantity,
          marketValue,
          currency,
          broker: 'IOL',
        } satisfies Position;
      })
      .filter((position) => position.symbol && position.quantity !== 0);
  }
}

export function getIolDirectApiAdapter(): IolDirectApiAdapter | null {
  const client = getIolApiClient();
  return client ? new IolDirectApiAdapter(client) : null;
}
