import type { BrokerAdapter } from '@/core/adapters/contracts';
import type { Position } from '@/core/domain/trading';

interface BridgePosition {
  symbol: string;
  quantity: number;
  unitPrice?: number;
  marketValue?: number;
  currency?: string;
  market?: string;
  assetType?: string;
}

interface BridgeResponse {
  positions?: BridgePosition[];
}

export class IOLBridgeBrokerAdapter implements BrokerAdapter {
  readonly id = 'iol-bridge';

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async getPositions(): Promise<Position[]> {
    const url = new URL('/portfolio', this.baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`IOL bridge error: HTTP ${response.status}`);
    }

    const payload = await response.json() as BridgeResponse;
    const positions = payload.positions ?? [];

    return positions
      .filter((position) => position.symbol && Number.isFinite(position.quantity))
      .map((position) => {
        const unitPrice = Number(position.unitPrice ?? 0);
        const explicitValue = Number(position.marketValue ?? 0);
        const calculatedValue = Number(position.quantity) * unitPrice;

        return {
          symbol: position.symbol.toUpperCase(),
          quantity: Number(position.quantity),
          marketValue: explicitValue > 0 ? explicitValue : Math.max(0, calculatedValue),
          currency: position.currency ?? 'ARS',
          broker: 'IOL',
        } satisfies Position;
      });
  }
}

export function getBrokerAdapter(): BrokerAdapter | null {
  const bridgeUrl = process.env.IOL_BRIDGE_URL?.trim();
  if (!bridgeUrl) return null;
  return new IOLBridgeBrokerAdapter(bridgeUrl, process.env.IOL_BRIDGE_TOKEN?.trim());
}
