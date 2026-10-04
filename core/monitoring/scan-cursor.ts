import { getRedisRestConfig } from '@/core/persistence/redis-env';

export interface MonitorCursorStore {
  take(total: number, batchSize: number): Promise<number>;
}

class RedisMonitorCursorStore implements MonitorCursorStore {
  private readonly key = 'senior-trading-analyst:monitor:cursor';

  constructor(
    private readonly restUrl: string,
    private readonly token: string,
  ) {}

  async take(total: number, batchSize: number): Promise<number> {
    if (total <= 0) return 0;
    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['INCRBY', this.key, Math.max(1, batchSize)]),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Monitor cursor store error: HTTP ${response.status}`);
    const payload = await response.json() as { result?: number | string };
    const next = Number(payload.result ?? batchSize);
    const start = next - Math.max(1, batchSize);
    return ((start % total) + total) % total;
  }
}

export function getMonitorCursorStore(): MonitorCursorStore | null {
  const config = getRedisRestConfig();
  if (!config) return null;
  return new RedisMonitorCursorStore(config.restUrl, config.token);
}

export function circularSlice<T>(items: T[], start: number, count: number): T[] {
  if (!items.length || count <= 0) return [];
  const size = Math.min(items.length, count);
  return Array.from({ length: size }, (_, index) => items[(start + index) % items.length]);
}
