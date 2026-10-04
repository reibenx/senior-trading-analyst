import { NextResponse } from 'next/server';
import { z } from 'zod';
import { calculatePortfolioFit } from '@/core/engines/portfolio-fit';

const positionSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  quantity: z.number().finite(),
  averagePrice: z.number().finite().optional(),
  marketValue: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().min(1).max(10),
  broker: z.string().trim().max(30).optional(),
});

const requestSchema = z.object({
  positions: z.array(positionSchema).max(500),
  symbol: z.string().trim().min(1).max(20),
  proposedAdditionValue: z.number().finite().nonnegative().default(0),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = calculatePortfolioFit(payload.positions, payload.symbol, payload.proposedAdditionValue);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid portfolio request', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to calculate portfolio fit' }, { status: 500 });
  }
}
