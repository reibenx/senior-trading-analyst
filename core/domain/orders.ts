export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market' | 'stop' | 'stop_limit' | 'trailing_stop';
export type SettlementTerm = 't0' | 't1';

export interface OrderDraft {
  asset: string;
  market: 'BCBA' | 'NYSE' | 'NASDAQ' | 'AMEX';
  side: OrderSide;
  type: OrderType;
  settlementTerm: SettlementTerm;
  quantity?: number;
  amount?: number;
  limitPrice?: number;
  rationale?: string;
}

export interface OrderValidationSuccess {
  valid: true;
  validationId?: string;
  confirmationUrl?: string;
  confirmationExpiresAt?: string;
  requiresDdjj?: boolean;
  ddjjUrl?: string;
  messages?: string[];
}

export interface OrderValidationFailure {
  valid: false;
  messages: string[];
}

export type OrderValidationResult = OrderValidationSuccess | OrderValidationFailure;

export interface OrderPlacementResult {
  accepted: boolean;
  orderId?: number;
  status?: string;
  message?: string;
}
