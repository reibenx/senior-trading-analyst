import type { AlertEvent, TradePlan } from '../domain/trading';
import type { NotificationProvider } from '../adapters/contracts';
import type { AlertStateStore } from './state-store';
import { appendActivity } from '../persistence/activity-store';

export interface MonitorRule {
  id: string;
  evaluate(plan: TradePlan): AlertEvent | null;
}

export class MonitoringAgent {
  constructor(
    private readonly rules: MonitorRule[],
    private readonly notifications: NotificationProvider[],
    private readonly stateStore?: AlertStateStore | null,
    private readonly dedupTtlSeconds = 86400,
  ) {}

  async evaluate(plan: TradePlan): Promise<AlertEvent[]> {
    const candidates = this.rules
      .map((rule) => rule.evaluate(plan))
      .filter((event): event is AlertEvent => event !== null);
    const events: AlertEvent[] = [];

    for (const event of candidates) {
      if (this.stateStore) {
        const acquired = await this.stateStore.acquire(event, this.dedupTtlSeconds);
        if (!acquired) continue;
      }

      await Promise.allSettled(this.notifications.map((provider) => provider.send(event)));
      await appendActivity({
        kind: 'ALERT',
        symbol: event.symbol,
        title: `${event.type} · ${event.symbol}`,
        detail: event.message,
        severity: event.severity,
        metadata: event.metadata,
        createdAt: event.createdAt,
      }).catch((error) => console.error('[ACTIVITY_STORE_ERROR]', error));
      events.push(event);
    }

    return events;
  }
}
