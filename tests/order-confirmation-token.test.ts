import { describe, expect, it } from 'vitest';
import { issueOrderConfirmationToken, verifyOrderConfirmationToken } from '@/core/execution/order-confirmation-token';
import type { OrderDraft } from '@/core/domain/orders';

const order: OrderDraft = {
  asset: 'NVDA',
  market: 'BCBA',
  side: 'buy',
  type: 'limit',
  settlementTerm: 't1',
  quantity: 10,
  limitPrice: 15000,
  rationale: 'sandbox test',
};

const secret = 'this-is-a-long-enough-test-secret';

describe('order confirmation token', () => {
  it('round-trips an order and validation id', () => {
    const now = 1_000_000;
    const token = issueOrderConfirmationToken({
      validationId: 'validation-123',
      order,
      mode: 'sandbox',
      secret,
      ttlSeconds: 90,
      nowMs: now,
    });
    const payload = verifyOrderConfirmationToken(token, secret, now + 10_000);
    expect(payload.validationId).toBe('validation-123');
    expect(payload.mode).toBe('sandbox');
    expect(payload.order).toEqual(order);
  });

  it('rejects tampered tokens', () => {
    const token = issueOrderConfirmationToken({
      validationId: 'validation-123',
      order,
      mode: 'sandbox',
      secret,
      nowMs: 1_000_000,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(() => verifyOrderConfirmationToken(tampered, secret, 1_010_000)).toThrow(/signature/i);
  });

  it('rejects expired tokens', () => {
    const token = issueOrderConfirmationToken({
      validationId: 'validation-123',
      order,
      mode: 'sandbox',
      secret,
      ttlSeconds: 15,
      nowMs: 1_000_000,
    });
    expect(() => verifyOrderConfirmationToken(token, secret, 1_020_000)).toThrow(/expired/i);
  });

  it('requires a sufficiently long secret', () => {
    expect(() => issueOrderConfirmationToken({
      validationId: 'validation-123',
      order,
      mode: 'sandbox',
      secret: 'short',
    })).toThrow(/24 characters/i);
  });
});
