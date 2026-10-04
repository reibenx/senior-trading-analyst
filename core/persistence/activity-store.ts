export type ActivityKind = 'ALERT' | 'ORDER_AUDIT' | 'DECISION' | 'SIGNAL';

export interface ActivityRecord {
  id: string;
  kind: ActivityKind;
  createdAt: string;
  symbol?: string;
  title: string;
  detail?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityStore {
  append(record: ActivityRecord): Promise<void>;
  list(limit?: number): Promise<ActivityRecord[]>;
}

export class UpstashActivityStore implements ActivityStore {
  private readonly key = 'senior-trading-analyst:activity';

  constructor(
    private readonly restUrl: string,
    private readonly token: string,
    private readonly maxItems = 1000,
  ) {}

  private async command<T = unknown>(command: unknown[]): Promise<T> {
    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Activity store error: HTTP ${response.status}`);
    const payload = await response.json() as { result: T };
    return payload.result;
  }

  async append(record: ActivityRecord): Promise<void> {
    await this.command(['LPUSH', this.key, JSON.stringify(record)]);
    await this.command(['LTRIM', this.key, 0, Math.max(0, this.maxItems - 1)]);
  }

  async list(limit = 100): Promise<ActivityRecord[]> {
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const rows = await this.command<string[]>(['LRANGE', this.key, 0, safeLimit - 1]);
    return (rows ?? []).flatMap((row) => {
      try {
        return [JSON.parse(row) as ActivityRecord];
      } catch {
        return [];
      }
    });
  }
}

export function getActivityStore(): ActivityStore | null {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!restUrl || !token) return null;
  const maxItems = Number(process.env.ACTIVITY_HISTORY_MAX_ITEMS ?? 1000);
  return new UpstashActivityStore(restUrl, token, Number.isFinite(maxItems) ? maxItems : 1000);
}

export async function appendActivity(record: Omit<ActivityRecord, 'id' | 'createdAt'> & Partial<Pick<ActivityRecord, 'id' | 'createdAt'>>) {
  const store = getActivityStore();
  if (!store) return;
  await store.append({
    ...record,
    id: record.id ?? crypto.randomUUID(),
    createdAt: record.createdAt ?? new Date().toISOString(),
  });
}
