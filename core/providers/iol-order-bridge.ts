import type { BrokerOrderAdapter } from '@/core/adapters/contracts';
import type { OrderDraft, OrderPlacementResult, OrderValidationResult } from '@/core/domain/orders';
import {
  assertPlacementAllowed,
  assertValidationAllowed,
  getExecutionPolicy,
  type ExecutionPolicy,
} from '@/core/execution/execution-policy';

interface ValidateBridgeResponse {
  valid: boolean;
  validation_id?: string;
  confirmation_url?: string;
  expires_at?: string;
  requires_ddjj?: boolean;
  ddjj_url?: string;
  messages?: string[];
}

interface PlaceBridgeResponse {
  accepted?: boolean;
  order_id?: number;
  status?: string;
  message?: string;
}

function toBridgeOrder(order: OrderDraft) {
  return {
    asset: order.asset,
    market: order.market,
    side: order.side,
    type: order.type,
    settlement_term: order.settlementTerm,
    quantity: order.quantity,
    amount: order.amount,
    limit_price: order.limitPrice,
    rationale: order.rationale ?? 'unspecified',
  };
}

export class IolOrderBridgeAdapter implements BrokerOrderAdapter {
  readonly id = 'iol-order-bridge';

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly policy: ExecutionPolicy = getExecutionPolicy(),
  ) {}

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async validateOrder(order: OrderDraft): Promise<OrderValidationResult> {
    assertValidationAllowed(this.policy);

    const url = new URL('/orders/validate', this.baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(toBridgeOrder(order)),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({})) as ValidateBridgeResponse;
    if (!response.ok) {
      return { valid: false, messages: payload.messages ?? [`IOL validation bridge HTTP ${response.status}`] };
    }

    if (!payload.valid) {
      return { valid: false, messages: payload.messages ?? ['La orden no superó la validación del broker.'] };
    }

    return {
      valid: true,
      validationId: payload.validation_id,
      confirmationUrl: payload.confirmation_url,
      confirmationExpiresAt: payload.expires_at,
      requiresDdjj: payload.requires_ddjj,
      ddjjUrl: payload.ddjj_url,
      messages: payload.messages,
    };
  }

  async placeValidatedOrder(validationId: string, order: OrderDraft): Promise<OrderPlacementResult> {
    assertPlacementAllowed(this.policy);
    if (!validationId) throw new Error('validationId is required');

    const url = new URL('/orders/place', this.baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ validation_id: validationId, ...toBridgeOrder(order) }),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({})) as PlaceBridgeResponse;
    return {
      accepted: Boolean(response.ok && payload.accepted !== false),
      orderId: payload.order_id,
      status: payload.status,
      message: payload.message ?? (response.ok ? undefined : `IOL placement bridge HTTP ${response.status}`),
    };
  }
}

export function getBrokerOrderAdapter(): BrokerOrderAdapter | null {
  const policy = getExecutionPolicy();
  if (!policy.validationEnabled) return null;

  const baseUrl = process.env.IOL_ORDER_BRIDGE_URL?.trim() || process.env.IOL_BRIDGE_URL?.trim();
  if (!baseUrl) return null;
  return new IolOrderBridgeAdapter(baseUrl, process.env.IOL_BRIDGE_TOKEN?.trim(), policy);
}
