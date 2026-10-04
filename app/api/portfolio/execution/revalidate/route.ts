import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { CedearExecutionIntent } from '@/core/domain/cedear';
import { getCedearConversionProvider } from '@/core/providers/cedear-conversion-bridge';
import { revalidateCedearExecution } from '@/core/services/revalidate-cedear-execution';

const intentSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  allocationUsd: z.number().nonnegative(),
  previewLocalPriceArs: z.number().positive(),
  previewQuantity: z.number().int().nonnegative(),
  previewCclArsPerUsd: z.number().positive(),
  previewRatio: z.number().positive(),
  previewedAt: z.string().min(1),
});

const requestSchema = z.object({
  intents: z.array(intentSchema).min(1).max(20),
  maxQuoteAgeSeconds: z.number().int().min(10).max(600).optional(),
  maxPriceDriftPercent: z.number().positive().max(10).optional(),
  maxCclDriftPercent: z.number().positive().max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = getCedearConversionProvider();
    if (!provider) {
      return NextResponse.json({ error: 'CEDEAR conversion provider is not configured' }, { status: 503 });
    }

    const conversions = await provider.getConversions(payload.intents.map((intent) => intent.symbol));
    const bySymbol = new Map(conversions.map((conversion) => [conversion.symbol.toUpperCase(), conversion]));

    const results = payload.intents.map((intent) => revalidateCedearExecution(
      intent as CedearExecutionIntent,
      bySymbol.get(intent.symbol.toUpperCase()),
      {
        maxQuoteAgeSeconds: payload.maxQuoteAgeSeconds,
        maxPriceDriftPercent: payload.maxPriceDriftPercent,
        maxCclDriftPercent: payload.maxCclDriftPercent,
        requireOpenMarket: true,
      },
    ));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      readyCount: results.filter((item) => item.readyToConfirm).length,
      blockedCount: results.filter((item) => !item.readyToConfirm).length,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid revalidation request', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to revalidate CEDEAR execution';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
