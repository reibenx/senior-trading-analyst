import type { Strategy } from '@/core/domain/trading';
import { getRedisRestConfig } from '@/core/persistence/redis-env';

export type ScannerDiscoveryTrend = 'ACCELERATING' | 'STABLE' | 'DETERIORATING';

export interface ScannerScoreObservation {
  score: number;
  observedAt: string;
}

export interface ScannerHistory {
  symbol: string;
  strategy: Strategy;
  observations: ScannerScoreObservation[];
}

export interface ScannerDiscoveryState {
  symbol: string;
  strategy: Strategy;
  score: number;
  previousScore?: number;
  scoreDelta?: number;
  observations: number;
  trend: ScannerDiscoveryTrend;
}

export interface ScannerHistoryStore {
  get(strategy: Strategy, symbol: string): Promise<ScannerHistory | null>;
  append(strategy: Strategy, symbol: string, score: number, observedAt: string): Promise<ScannerHistory>;
}

function normalizeObservations(observations: ScannerScoreObservation[], maxItems = 8) {
  return observations
    .filter((item) => Number.isFinite(item.score) && Boolean(item.observedAt))
    .slice(-maxItems);
}

export function buildScannerDiscoveryState(
  symbol: string,
  strategy: Strategy,
  score: number,
  history: ScannerHistory | null,
): ScannerDiscoveryState {
  const previous = history?.observations.at(-1);
  const scoreDelta = previous ? score - previous.score : undefined;
  const trend: ScannerDiscoveryTrend = scoreDelta === undefined
    ? 'STABLE'
    : scoreDelta >= 5
      ? 'ACCELERATING'
      : scoreDelta <= -5
        ? 'DETERIORATING'
        : 'STABLE';

  return {
    symbol: symbol.toUpperCase(),
    strategy,
    score,
    previousScore: previous?.score,
    scoreDelta,
    observations: (history?.observations.length ?? 0) + 1,
    trend,
  };
}

class RedisScannerHistoryStore implements ScannerHistoryStore {
  constructor(
    private readonly restUrl: string,
    private readonly token: string,
  ) {}

  private key(strategy: Strategy, symbol: string) {
    return `senior-trading-analyst:scanner-history:${strategy}:${symbol.toUpperCase()}`;
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
    if (!response.ok) throw new Error(`Scanner history store error: HTTP ${response.status}`);
    const payload = await response.json() as { result: T };
    return payload.result;
  }

  async get(strategy: Strategy, symbol: string): Promise<ScannerHistory | null> {
    const raw = await this.command<string | null>(['GET', this.key(strategy, symbol)]);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ScannerHistory;
      return {
        symbol: parsed.symbol.toUpperCase(),
        strategy: parsed.strategy,
        observations: normalizeObservations(parsed.observations ?? []),
      };
    } catch {
      return null;
    }
  }

  async append(strategy: Strategy, symbol: string, score: number, observedAt: string): Promise<ScannerHistory> {
    const current = await this.get(strategy, symbol);
    const next: ScannerHistory = {
      symbol: symbol.toUpperCase(),
      strategy,
      observations: normalizeObservations([
        ...(current?.observations ?? []),
        { score, observedAt },
      ]),
    };
    await this.command([
      'SET',
      this.key(strategy, symbol),
      JSON.stringify(next),
      'EX',
      7 * 24 * 60 * 60,
    ]);
    return next;
  }
}

export function getScannerHistoryStore(): ScannerHistoryStore | null {
  const redis = getRedisRestConfig();
  if (!redis) return null;
  return new RedisScannerHistoryStore(redis.restUrl, redis.token);
}
