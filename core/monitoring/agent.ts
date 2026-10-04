import type { AlertEvent, TradePlan } from '../domain/trading';
import type { NotificationProvider } from '../adapters/contracts';

export interface MonitorRule {
  id: string;
  evaluate(plan: TradePlan): AlertEvent | null;
}

export class MonitoringAgent {
  constructor(
    private readonly rules: MonitorRule[],
    private readonly notifications: NotificationProvider[]
  ) {}

  async evaluate(plan: TradePlan): Promise<AlertEvent[]> {
    const events = this.rules.map(rule => rule.evaluate(plan)).filter((event): event is AlertEvent => event !== null);

    for (const event of events) {
      await Promise.allSettled(this.notifications.map(provider => provider.send(event)));
    }

    return events;
  }
}
