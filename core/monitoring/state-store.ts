import type { AlertEvent } from '@/core/domain/trading';

export interface AlertStateStore {
  acquire(event: AlertEvent, ttlSeconds: number): Promise<boolean>;
}

export class UpstashAlertStateStore implements AlertStateStore {
  constructor(
    private readonly restUrl: string,
    private readonly token: string,
  ) {}

  async acquire(event: AlertEvent, ttlSeconds: number): Promise<boolean> {
    const dedupKey = typeof event.metadata?.dedupKey === 'string'
      ? event.metadata.dedupKey
      : `${event.symbol}:${event.type}`;
    const key = `senior-trading-analyst:alert:${dedupKey}`;

    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, event.createdAt, 'NX', 'EX', ttlSeconds]),
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`Alert state store error: HTTP ${response.status}`);
    const payload = await response.json() as { result?: string | null };
    return payload.result === 'OK';
  }
}

export function getAlertStateStore(): AlertStateStore | null {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!restUrl || !token) return null;
  return new UpstashAlertStateStore(restUrl, token);
}
