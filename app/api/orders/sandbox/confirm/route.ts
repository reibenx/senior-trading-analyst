import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSimulationAllowed, getExecutionPolicy } from '@/core/execution/execution-policy';
import { verifyOrderConfirmationToken } from '@/core/execution/order-confirmation-token';
import { recordOrderAudit } from '@/core/execution/order-audit';
import { getBrokerOrderAdapter } from '@/core/providers/iol-order-bridge';

const requestSchema = z.object({
  confirmationToken: z.string().min(20),
  explicitConfirmation: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const policy = getExecutionPolicy();
    assertSimulationAllowed(policy);

    const secret = process.env.ORDER_CONFIRMATION_SECRET?.trim() ?? '';
    const ticket = verifyOrderConfirmationToken(payload.confirmationToken, secret);
    if (ticket.mode !== 'sandbox' || policy.mode !== 'sandbox') {
      return NextResponse.json({ error: 'Sandbox mode changed after validation; start again.' }, { status: 409 });
    }

    const adapter = getBrokerOrderAdapter();
    if (!adapter) return NextResponse.json({ error: 'Order validation adapter is not configured' }, { status: 503 });

    await recordOrderAudit({
      stage: 'SANDBOX_CONFIRMATION_RECEIVED',
      mode: policy.mode,
      order: ticket.order,
      brokerAdapterId: adapter.id,
      validationIdPresent: true,
      accepted: true,
    });

    const revalidation = await adapter.validateOrder(ticket.order);
    if (!revalidation.valid) {
      await recordOrderAudit({
        stage: 'REVALIDATION_REJECTED',
        mode: policy.mode,
        order: ticket.order,
        brokerAdapterId: adapter.id,
        accepted: false,
        message: revalidation.messages.join(' | '),
      });
      return NextResponse.json({
        simulated: false,
        actionRequired: 'REVIEW',
        messages: revalidation.messages,
      }, { status: 409 });
    }

    if (revalidation.confirmationUrl) {
      await recordOrderAudit({
        stage: 'EXTERNAL_CONFIRMATION_REQUIRED',
        mode: policy.mode,
        order: ticket.order,
        brokerAdapterId: adapter.id,
        accepted: true,
        message: 'Broker-hosted confirmation required during sandbox revalidation',
      });
      return NextResponse.json({
        simulated: false,
        actionRequired: 'BROKER_CONFIRMATION',
        confirmationUrl: revalidation.confirmationUrl,
        confirmationExpiresAt: revalidation.confirmationExpiresAt,
        messages: revalidation.messages,
      }, { status: 409 });
    }

    if (revalidation.requiresDdjj) {
      await recordOrderAudit({
        stage: 'DDJJ_REQUIRED',
        mode: policy.mode,
        order: ticket.order,
        brokerAdapterId: adapter.id,
        accepted: true,
        message: 'DDJJ required during sandbox revalidation',
      });
      return NextResponse.json({
        simulated: false,
        actionRequired: 'DDJJ',
        ddjjUrl: revalidation.ddjjUrl,
        messages: revalidation.messages,
      }, { status: 409 });
    }

    await recordOrderAudit({
      stage: 'REVALIDATION_APPROVED',
      mode: policy.mode,
      order: ticket.order,
      brokerAdapterId: adapter.id,
      validationIdPresent: Boolean(revalidation.validationId),
      accepted: true,
    });

    const receiptId = crypto.randomUUID();
    await recordOrderAudit({
      stage: 'SANDBOX_SIMULATED',
      mode: policy.mode,
      order: ticket.order,
      brokerAdapterId: adapter.id,
      validationIdPresent: Boolean(revalidation.validationId),
      accepted: true,
      message: `Simulation receipt ${receiptId}`,
    });

    return NextResponse.json({
      simulated: true,
      mode: 'sandbox',
      receiptId,
      simulatedAt: new Date().toISOString(),
      order: ticket.order,
      brokerValidated: true,
      brokerValidationIdPresent: Boolean(revalidation.validationId),
      message: 'Simulación completada. No se envió ninguna orden al mercado.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Explicit sandbox confirmation is required', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to simulate order';
    const status = message.includes('expired') ? 409 : message.includes('Sandbox') || message.includes('deshabilitada') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
