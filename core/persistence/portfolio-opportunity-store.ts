import { createHash } from 'node:crypto';
import type { PortfolioOpportunity, PortfolioRankingSnapshot } from '@/core/domain/opportunity';
import type { Position, Strategy } from '@/core/domain/trading';
import { getRedisRestConfig } from '@/core/persistence/redis-env';

export interface PortfolioOpportunityStore {
  getMany(strategy: Strategy, portfolioFingerprint: string, symbols: string[]): Promise<Map<string, PortfolioOpportunity>>;
  set(strategy: Strategy, portfolioFingerprint: string, opportunity: PortfolioOpportunity, ttlSeconds: number): Promise<void>;
  getLatestRanking(strategy: Strategy, portfolioFingerprint: string): Promise<PortfolioRankingSnapshot | null>;
  setLatestRanking(snapshot: PortfolioRankingSnapshot, ttlSeconds: number): Promise<void>;
}

export function buildPortfolioFingerprint(positions: Position[]): string {
  const normalized = positions
    .filter((position) => position.quantity > 0)
    .map((position) => [
      position.symbol.toUpperCase(),
      Number(position.quantity.toFixed(6)),
      Number((position.marketValue ?? 0).toFixed(2)),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16);
}

export class UpstashPortfolioOpportunityStore implements PortfolioOpportunityStore {
  constructor(
    private readonly restUrl: string,
    private readonly token: string,
  ) {}

  private key(strategy: Strategy, portfolioFingerprint: string, symbol: string) {
    return `senior-trading-analyst:portfolio-opportunity:${strategy}:${portfolioFingerprint}:${symbol.toUpperCase()}`;
  }

  private rankingKey(strategy: Strategy, portfolioFingerprint: string) {
    return `senior-trading-analyst:portfolio-ranking:${strategy}:${portfolioFingerprint}`;
  }

  private async command<T = unknown>(command: unknown[]): Promise<T> {
    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Portfolio opportunity store error: HTTP ${response.status}`);
    const payload = await response.json() as { result: T };
    return payload.result;
  }

  async getMany(strategy: Strategy, portfolioFingerprint: string, symbols: string[]) {
    const result = new Map<string, PortfolioOpportunity>();
    if (!symbols.length) return result;

    const keys = symbols.map((symbol) => this.key(strategy, portfolioFingerprint, symbol));
    const values = await this.command<Array<string | null>>(['MGET', ...keys]);

    for (let index = 0; index < symbols.length; index += 1) {
      const raw = values?.[index];
      if (!raw) continue;
      try {
        result.set(symbols[index].toUpperCase(), JSON.parse(raw) as PortfolioOpportunity);
      } catch {
        // Ignore corrupt cache entries and refresh them from providers.
      }
    }
    return result;
  }

  async set(strategy: Strategy, portfolioFingerprint: string, opportunity: PortfolioOpportunity, ttlSeconds: number) {
    const ttl = Math.max(60, Math.floor(ttlSeconds));
    await this.command([
      'SET',
      this.key(strategy, portfolioFingerprint, opportunity.symbol),
      JSON.stringify(opportunity),
      'EX',
      ttl,
    ]);
  }

  async getLatestRanking(strategy: Strategy, portfolioFingerprint: string): Promise<PortfolioRankingSnapshot | null> {
    const raw = await this.command<string | null>(['GET', this.rankingKey(strategy, portfolioFingerprint)]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PortfolioRankingSnapshot;
    } catch {
      return null;
    }
  }

  async setLatestRanking(snapshot: PortfolioRankingSnapshot, ttlSeconds: number): Promise<void> {
    const ttl = Math.max(60, Math.floor(ttlSeconds));
    await this.command([
      'SET',
      this.rankingKey(snapshot.strategy, snapshot.portfolioFingerprint),
      JSON.stringify(snapshot),
      'EX',
      ttl,
    ]);
  }
}

export function getPortfolioOpportunityStore(): PortfolioOpportunityStore | null {
  const redis = getRedisRestConfig();
  if (!redis) return null;
  return new UpstashPortfolioOpportunityStore(redis.restUrl, redis.token);
}

export function portfolioOpportunityTtlSeconds(strategy: Strategy) {
  const defaults: Record<Strategy, number> = {
    day: 10 * 60,
    swing: 60 * 60,
    position: 6 * 60 * 60,
  };
  const configured = Number(process.env.PORTFOLIO_OPPORTUNITY_CACHE_TTL_SECONDS ?? defaults[strategy]);
  if (!Number.isFinite(configured)) return defaults[strategy];
  return Math.max(60, Math.min(24 * 60 * 60, Math.floor(configured)));
}
