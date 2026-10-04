import type { ExecutionMode } from '@/core/execution/execution-policy';
import type { OrderDraft } from '@/core/domain/orders';
import { appendActivity } from '@/core/persistence/activity-store';

export type OrderAuditStage =
  | 'VALIDATION_REQUESTED'
  | 'VALIDATION_REJECTED'
  | 'VALIDATION_APPROVED'
  | 'EXTERNAL_CONFIRMATION_REQUIRED'
  | 'DDJJ_REQUIRED'
  | 'SANDBOX_CONFIRMATION_RECEIVED'
  | 'REVALIDATION_REJECTED'
  | 'REVALIDATION_APPROVED'
  | 'SANDBOX_SIMULATED';

export interface OrderAuditEvent {
  id: string;
  timestamp: string;
  stage: OrderAuditStage;
  mode: ExecutionMode;
  order: OrderDraft;
  brokerAdapterId?: string;
  validationIdPresent?: boolean;
  accepted?: boolean;
  message?: string;
}

export interface OrderAuditSink {
  readonly id: string;
  write(event: OrderAuditEvent): Promise<void>;
}

class ConsoleAuditSink implements OrderAuditSink {
  readonly id = 'console-order-audit';
  async write(event: OrderAuditEvent) {
    console.info('[ORDER_AUDIT]', JSON.stringify(event));
  }
}

class BridgeAuditSink implements OrderAuditSink {
  readonly id = 'bridge-order-audit';
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  async write(event: OrderAuditEvent) {
    const response = await fetch(new URL('/order-audit', this.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(event),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Order audit bridge HTTP ${response.status}`);
  }
}

export function getOrderAuditSink(): OrderAuditSink {
  const url = process.env.ORDER_AUDIT_BRIDGE_URL?.trim();
  if (!url) return new ConsoleAuditSink();
  return new BridgeAuditSink(url, process.env.ORDER_AUDIT_BRIDGE_TOKEN?.trim());
}

export async function recordOrderAudit(event: Omit<OrderAuditEvent, 'id' | 'timestamp'>) {
  const payload: OrderAuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const tasks: Promise<unknown>[] = [getOrderAuditSink().write(payload)];
  tasks.push(appendActivity({
    id: payload.id,
    createdAt: payload.timestamp,
    kind: 'ORDER_AUDIT',
    symbol: payload.order.asset,
    title: `${payload.stage} · ${payload.order.asset}`,
    detail: payload.message,
    severity: payload.accepted === false ? 'WARNING' : 'INFO',
    metadata: {
      mode: payload.mode,
      side: payload.order.side,
      type: payload.order.type,
      quantity: payload.order.quantity,
      amount: payload.order.amount,
      limitPrice: payload.order.limitPrice,
      validationIdPresent: payload.validationIdPresent,
      brokerAdapterId: payload.brokerAdapterId,
    },
  }));

  await Promise.allSettled(tasks).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') console.error('[ORDER_AUDIT_ERROR]', result.reason);
    }
  });
  return payload;
}
