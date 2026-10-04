import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCedearConversionProvider } from '@/core/providers/cedear-conversion-bridge';
import { buildCedearExecutionBatch } from '@/core/services/build-cedear-execution-batch';

const allocationItemSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  allocationPercent: z.number().min(0).max(100),
  allocationAmount: z.number().nonnegative(),
  opportunityScore: z.number().min(0).max(100),
  currentWeightPercent: z.number().min(0).max(100),
  rationale: z.string(),
});

const requestSchema = z.object({
  allocation: z.object({
    capital: z.number().positive(),
    currency: z.literal('USD'),
    allocated: z.number().nonnegative(),
    cashReserve: z.number().nonnegative(),
    items: z.array(allocationItemSchema).max(20),
    notes: z.array(z.string()),
  }),
  maxConversionAgeMinutes: z.number().int().min(1).max(1440).default(30),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = getCedearConversionProvider();
    if (!provider) {
      return NextResponse.json({ error: 'CEDEAR conversion bridge is not configured' }, { status: 503 });
    }

    const symbols = payload.allocation.items.map((item) => item.symbol);
    const conversions = await provider.getConversions(symbols);
    const batch = buildCedearExecutionBatch(
      payload.allocation,
      conversions,
      payload.maxConversionAgeMinutes,
    );

    return NextResponse.json({ provider: provider.id, ...batch });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid execution preview request', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to build CEDEAR execution preview',
    }, { status: 500 });
  }
}
