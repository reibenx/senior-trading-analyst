import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PortfolioOpportunitySummary } from '@/core/domain/opportunity';
import type { Position, Strategy } from '@/core/domain/trading';
import type { Timeframe } from '@/core/domain/market';
import { buildPortfolioOpportunity } from '@/core/engines/opportunity';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';
import { analyzeSymbol } from '@/core/services/analyze-symbol';
import { buildTradePlan } from '@/core/services/build-trade-plan';

const requestSchema = z.object({
  strategy: z.enum(['day', 'swing', 'position']).default('position'),
  maxSymbols: z.number().int().min(1).max(50).default(25),
  symbols: z.array(z.string().trim().min(1).max(20)).max(50).optional(),
});

const TIMEFRAME: Record<Strategy, Timeframe> = {
  day: '15m',
  swing: '1d',
  position: '1w',
};

async function analyzeOne(symbol: string, strategy: Strategy, positions: Position[]) {
  const analysis = await analyzeSymbol({ symbol, strategy, timeframe: TIMEFRAME[strategy] });
  const plan = buildTradePlan({
    strategy,
    snapshot: analysis.snapshot,
    fundamentalScore: analysis.fundamentalScore,
    marketContext: analysis.marketContext,
    positions,
  });
  return buildPortfolioOpportunity(plan, positions);
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const broker = getBrokerAdapter();
    if (!broker) {
      return NextResponse.json({ error: 'IOL bridge is not configured' }, { status: 503 });
    }

    const positions = await broker.getPositions();
    const requestedSymbols = payload.symbols?.map((symbol) => symbol.toUpperCase());
    const portfolioSymbols = positions
      .filter((position) => position.quantity > 0)
      .map((position) => position.symbol.toUpperCase());

    const symbols = [...new Set(requestedSymbols?.length ? requestedSymbols : portfolioSymbols)]
      .slice(0, payload.maxSymbols);

    const opportunities = [];
    const errors: Array<{ symbol: string; error: string }> = [];

    for (const symbol of symbols) {
      try {
        opportunities.push(await analyzeOne(symbol, payload.strategy, positions));
      } catch (error) {
        errors.push({
          symbol,
          error: error instanceof Error ? error.message : 'Unable to analyze symbol',
        });
      }
    }

    opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
    const portfolioValue = positions.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);

    const summary: PortfolioOpportunitySummary = {
      generatedAt: new Date().toISOString(),
      strategy: payload.strategy,
      portfolioValue,
      analyzed: opportunities.length,
      failed: errors.length,
      opportunities,
      errors,
    };

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid portfolio request', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to analyze portfolio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
