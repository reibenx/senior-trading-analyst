import { getRedisRestConfig } from '@/core/persistence/redis-env';

export type Thesis2027HistoryTrend = 'STRENGTHENING' | 'STABLE' | 'WEAKENING';

export interface Thesis2027HistoryObservation {
  observedAt: string;
  adjustment: number;
  evidenceStatus?: 'CONFIRMED' | 'MIXED' | 'WEAK' | 'INSUFFICIENT';
  eventStatus?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT';
  dynamicAdjustment?: number;
  eventAdjustment?: number;
  structuredAdjustment?: number;
}

export interface Thesis2027History {
  symbol: string;
  observations: Thesis2027HistoryObservation[];
}

export interface Thesis2027HistoryState {
  symbol: string;
  observations: number;
  currentAdjustment: number;
  previousAdjustment?: number;
  adjustmentDelta?: number;
  trend: Thesis2027HistoryTrend;
  regimeChanged: boolean;
  previousEvidenceStatus?: Thesis2027HistoryObservation['evidenceStatus'];
  currentEvidenceStatus?: Thesis2027HistoryObservation['evidenceStatus'];
  firstObservedAt?: string;
  lastObservedAt: string;
}

export interface Thesis2027HistoryStore {
  get(symbol: string): Promise<Thesis2027History | null>;
  append(symbol: string, observation: Thesis2027HistoryObservation): Promise<Thesis2027History>;
}

function normalizeObservations(observations: Thesis2027HistoryObservation[], maxItems = 24) {
  return observations
    .filter((item) => Boolean(item.observedAt) && Number.isFinite(item.adjustment))
    .slice(-maxItems);
}

export function buildThesis2027HistoryState(
  symbol: string,
  current: Thesis2027HistoryObservation,
  history: Thesis2027History | null,
): Thesis2027HistoryState {
  const previous = history?.observations.at(-1);
  const delta = previous ? current.adjustment - previous.adjustment : undefined;
  const trend: Thesis2027HistoryTrend = delta === undefined
    ? 'STABLE'
    : delta >= 2
      ? 'STRENGTHENING'
      : delta <= -2
        ? 'WEAKENING'
        : 'STABLE';

  return {
    symbol: symbol.toUpperCase(),
    observations: (history?.observations.length ?? 0) + 1,
    currentAdjustment: current.adjustment,
    previousAdjustment: previous?.adjustment,
    adjustmentDelta: delta,
    trend,
    regimeChanged: Boolean(
      previous?.evidenceStatus
      && current.evidenceStatus
      && previous.evidenceStatus !== current.evidenceStatus,
    ),
    previousEvidenceStatus: previous?.evidenceStatus,
    currentEvidenceStatus: current.evidenceStatus,
    firstObservedAt: history?.observations[0]?.observedAt ?? current.observedAt,
    lastObservedAt: current.observedAt,
  };
}

class RedisThesis2027HistoryStore implements Thesis2027HistoryStore {
  constructor(
    private readonly restUrl: string,
    private readonly token: string,
  ) {}

  private key(symbol: string) {
    return `senior-trading-analyst:thesis-2027-history:${symbol.toUpperCase()}`;
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
    if (!response.ok) throw new Error(`Thesis history store error: HTTP ${response.status}`);
    const payload = await response.json() as { result: T };
    return payload.result;
  }

  async get(symbol: string): Promise<Thesis2027History | null> {
    const raw = await this.command<string | null>(['GET', this.key(symbol)]);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Thesis2027History;
      return {
        symbol: parsed.symbol.toUpperCase(),
        observations: normalizeObservations(parsed.observations ?? []),
      };
    } catch {
      return null;
    }
  }

  async append(symbol: string, observation: Thesis2027HistoryObservation): Promise<Thesis2027History> {
    const current = await this.get(symbol);
    const next: Thesis2027History = {
      symbol: symbol.toUpperCase(),
      observations: normalizeObservations([
        ...(current?.observations ?? []),
        observation,
      ]),
    };
    await this.command([
      'SET',
      this.key(symbol),
      JSON.stringify(next),
      'EX',
      90 * 24 * 60 * 60,
    ]);
    return next;
  }
}

export function getThesis2027HistoryStore(): Thesis2027HistoryStore | null {
  const redis = getRedisRestConfig();
  if (!redis) return null;
  return new RedisThesis2027HistoryStore(redis.restUrl, redis.token);
}
