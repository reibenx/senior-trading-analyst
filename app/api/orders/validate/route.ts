import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getExecutionPolicy, assertValidationAllowed } from '@/core/execution/execution-policy';
import { issueOrderConfirmationToken } from '@/core/execution/order-confirmation-token';
import { recordOrderAudit } from '@/core/execution/order-audit';
import { getBrokerOrderAdapter } from '@/core/providers/iol-order-bridge';
import type { OrderDraft } from '@/core/domain/orders';

const orderSchema = z.object({
  asset: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  market: z.enum(['BCBA', 'NYSE', 'NASDAQ', 'AMEX']),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['limit', 'market', 'stop', 'stop_limit', 'trailing_stop']),
  settlementTerm: z.enum(['t0', 't1']),
  quantity: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  limitPrice: z.number().positive().optional(),
  rationale: z.string().trim().max(140).optional(),
}).superRefine((order, context) => {
  if (order.quantity === undefined && order.amount === undefined) {
    context.addIssue({ code: 'custom', message: 'quantity or amount is required', path: ['quantity'] });
  }
  if ((order.type === 'limit' || order.type === 'stop_limit') && order.limitPrice === undefined) {
    context.addIssue({ code: 'custom', message: 'limitPrice is required for this order type', path: ['limitPrice'] });
  }
});

export async function POST(request: Request) {
  try {
    const order = orderSchema.parse(await request.json()) as OrderDraft;
    const policy = getExecutionPolicy();
    assertValidationAllowed(policy);

    const adapter = getBrokerOrderAdapter();
    if (!adapter) {
      return NextResponse.json({ error: 'Order adapter is not configured' }, { status: 503 });
    }

    await recordOrderAudit({
      stage: 'VALIDATION_REQUESTED',
      mode: policy.mode,
      order,
      brokerAdapterId: adapter.id,
    });

    const validation = await adapter.validateOrder(order);
    if (!validation.valid) {
      await recordOrderAudit({
        stage: 'VALIDATION_REJECTED',
        mode: policy.mode,
        order,
        brokerAdapterId: adapter.id,
        accepted: false,
        message: validation.messages.join(' | '),
      });
      return NextResponse.json({
        valid: false,
        messages: validation.messages,
        mode: policy.mode,
      }, { status: 422 });
    }

    if (validation.confirmationUrl) {
      await recordOrderAudit({
        stage: 'EXTERNAL_CONFIRMATION_REQUIRED',
        mode: policy.mode,
        order,
        brokerAdapterId: adapter.id,
        accepted: true,
        message: 'Broker-hosted confirmation required',
      });
      return NextResponse.json({
        valid: true,
        mode: policy.mode,
        confirmationUrl: validation.confirmationUrl,
        confirmationExpiresAt: validation.confirmationExpiresAt,
        messages: validation.messages,
        placementReady: false,
        actionRequired: 'BROKER_CONFIRMATION',
      });
    }

    if (validation.requiresDdjj) {
      await recordOrderAudit({
        stage: 'DDJJ_REQUIRED',
        mode: policy.mode,
        order,
        brokerAdapterId: adapter.id,
        accepted: true,
        message: validation.ddjjUrl ? 'DDJJ required' : 'DDJJ required; URL unavailable',
      });
      return NextResponse.json({
        valid: true,
        mode: policy.mode,
        requiresDdjj: true,
        ddjjUrl: validation.ddjjUrl,
        messages: validation.messages,
        placementReady: false,
        actionRequired: 'DDJJ',
      });
    }

    if (!validation.validationId) {
      return NextResponse.json({ error: 'Broker validation succeeded without a usable validation id' }, { status: 502 });
    }

    const secret = process.env.ORDER_CONFIRMATION_SECRET?.trim() ?? '';
    const confirmationToken = issueOrderConfirmationToken({
      validationId: validation.validationId,
      order,
      mode: policy.mode,
      secret,
      ttlSeconds: 90,
    });

    await recordOrderAudit({
      stage: 'VALIDATION_APPROVED',
      mode: policy.mode,
      order,
      brokerAdapterId: adapter.id,
      validationIdPresent: true,
      accepted: true,
    });

    return NextResponse.json({
      valid: true,
      mode: policy.mode,
      placementReady: policy.placementEnabled,
      confirmationToken,
      confirmationExpiresInSeconds: 90,
      messages: validation.messages,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid order draft', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to validate order';
    const status = message.includes('disabled') || message.includes('deshabilitada') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
