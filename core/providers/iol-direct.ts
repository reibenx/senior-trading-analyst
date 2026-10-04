import type { BrokerAdapter } from '@/core/adapters/contracts';
import type { Position } from '@/core/domain/trading';

interface IolTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface TokenCache {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

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

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private async requestToken(body: URLSearchParams): Promise<TokenCache> {
    const response = await fetch(new URL('/token', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`IOL authentication error: HTTP ${response.status}`);
    const payload = await response.json() as IolTokenResponse;
    if (!payload.access_token) throw new Error('IOL authentication response did not include access_token');
    const expiresIn = Math.max(60, Number(payload.expires_in ?? 900));
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + expiresIn * 1000 - 60_000,
    };
  }

  private async authenticate(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.accessToken;

    if (tokenCache?.refreshToken) {
      try {
        tokenCache = await this.requestToken(new URLSearchParams({
          refresh_token: tokenCache.refreshToken,
          grant_type: 'refresh_token',
        }));
        return tokenCache.accessToken;
      } catch {
        tokenCache = null;
      }
    }

    tokenCache = await this.requestToken(new URLSearchParams({
      username: this.username,
      password: this.password,
      grant_type: 'password',
    }));
    return tokenCache.accessToken;
  }

  async getPositions(): Promise<Position[]> {
    const token = await this.authenticate();
    const response = await fetch(new URL('/api/micuenta/miportafolio', this.baseUrl), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`IOL portfolio error: HTTP ${response.status}`);

    const payload = await response.json() as unknown;
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
  const username = process.env.IOL_API_USERNAME?.trim();
  const password = process.env.IOL_API_PASSWORD?.trim();
  if (!username || !password) return null;
  return new IolDirectApiAdapter(
    process.env.IOL_API_BASE_URL?.trim() || 'https://api.invertironline.com',
    username,
    password,
  );
}
