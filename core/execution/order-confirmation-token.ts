import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OrderDraft } from '@/core/domain/orders';
import type { ExecutionMode } from '@/core/execution/execution-policy';

interface ConfirmationPayload {
  v: 1;
  iat: number;
  exp: number;
  mode: ExecutionMode;
  validationId: string;
  order: OrderDraft;
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(payloadPart: string, secret: string) {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

export function issueOrderConfirmationToken(input: {
  validationId: string;
  order: OrderDraft;
  mode: ExecutionMode;
  secret: string;
  ttlSeconds?: number;
  nowMs?: number;
}) {
  if (!input.secret || input.secret.length < 24) {
    throw new Error('ORDER_CONFIRMATION_SECRET must contain at least 24 characters');
  }
  const nowMs = input.nowMs ?? Date.now();
  const ttlSeconds = Math.min(300, Math.max(15, input.ttlSeconds ?? 90));
  const payload: ConfirmationPayload = {
    v: 1,
    iat: nowMs,
    exp: nowMs + ttlSeconds * 1000,
    mode: input.mode,
    validationId: input.validationId,
    order: input.order,
  };
  const payloadPart = encode(JSON.stringify(payload));
  return `${payloadPart}.${signature(payloadPart, input.secret)}`;
}

export function verifyOrderConfirmationToken(token: string, secret: string, nowMs = Date.now()): ConfirmationPayload {
  if (!secret || secret.length < 24) throw new Error('ORDER_CONFIRMATION_SECRET is not configured safely');
  const [payloadPart, providedSignature, ...rest] = token.split('.');
  if (!payloadPart || !providedSignature || rest.length) throw new Error('Invalid confirmation token format');

  const expected = signature(payloadPart, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid confirmation token signature');
  }

  const payload = JSON.parse(decode(payloadPart)) as ConfirmationPayload;
  if (payload.v !== 1 || !payload.validationId || !payload.order || !payload.mode) {
    throw new Error('Invalid confirmation token payload');
  }
  if (!Number.isFinite(payload.exp) || nowMs > payload.exp) throw new Error('Confirmation token expired');
  if (!Number.isFinite(payload.iat) || payload.iat > nowMs + 5_000) throw new Error('Invalid confirmation token timestamp');
  return payload;
}
