import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PortfolioOpportunitySummary, PortfolioRankingSnapshot } from '@/core/domain/opportunity';
import type { Position, Strategy } from '@/core/domain/trading';
import type { Timeframe } from '@/core/domain/market';
import { buildPortfolioOpportunity } from '@/core/engines/opportunity';
import { buildMonthlyAllocationPlan } from '@/core/engines/monthly-allocation';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';
import { getMarketDataProvider } from '@/core/providers/market-provider';
import {
  buildPortfolioFingerprint,
  getPortfolioOpportunityStore,
  portfolioOpportunityTtlSeconds,
} from '@/core/persistence/portfolio-opportunity-store';
import { analyzeSymbol } from '@/core/services/analyze-symbol';
import { buildTradePlan } from '@/core/services/build-trade-plan';
import { enrichOpportunityWithThesis2027Events } from '@/core/services/thesis-2027-events';

const requestSchema = z.object({
  strategy: z.enum(['day', 'swing', 'position']).default('position'),
  maxSymbols: z.number().int().min(1).max(50).default(25),
  monthlyCapital: z.number().nonnegative().max(10000000).optional(),
  maxAllocationIdeas: z.number().int().min(1).max(8).default(4),
  symbols: z.array(z.string().trim().min(1).max(20)).max(50).optional(),
});

const TIMEFRAME: Record<Strategy, Timeframe> = {
  day: '15m',
  swing: '1d',
  position: '1w',
};

function twelveDataPortfolioBatchLimit() {
  const configured = Number(process.env.TWELVE_DATA_PORTFOLIO_BATCH_SIZE ?? '5');
  if (!Number.isFinite(configured)) return 5;
  return Math.max(1, Math.min(7, Math.floor(configured)));
}

async function analyzeOne(symbol: string, strategy: Strategy, positions: Position[]) {
  const analysis = await analyzeSymbol({
    symbol,
    strategy,
    timeframe: TIMEFRAME[strategy],
    includeSectorContext: false,
  });
  const plan = buildTradePlan({
    strategy,
    snapshot: analysis.snapshot,
    fundamentalScore: analysis.fundamentalScore,
    marketContext: analysis.marketContext,
    positions,
  });
  const opportunity = buildPortfolioOpportunity(plan, positions);
  return enrichOpportunityWithThesis2027Events(opportunity, analysis.fundamentals);
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
      .sort((a, b) => Math.max(0, b.marketValue ?? 0) - Math.max(0, a.marketValue ?? 0))
      .map((position) => position.symbol.toUpperCase());

    const allSymbols = [...new Set(requestedSymbols?.length ? requestedSymbols : portfolioSymbols)]
      .slice(0, payload.maxSymbols);

    const marketProvider = getMarketDataProvider();
    const store = getPortfolioOpportunityStore();
    const portfolioFingerprint = buildPortfolioFingerprint(positions);
    const cached = store
      ? await store.getMany(payload.strategy, portfolioFingerprint, allSymbols).catch(() => new Map())
      : new Map();

    const missingSymbols = allSymbols.filter((symbol) => !cached.has(symbol));
    const batchLimit = marketProvider.id === 'twelve-data'
      ? Math.min(missingSymbols.length, twelveDataPortfolioBatchLimit())
      : missingSymbols.length;
    const symbolsToAnalyze = missingSymbols.slice(0, batchLimit);
    const deferred = missingSymbols.slice(batchLimit);

    const opportunities = [...cached.values()];
    const errors: Array<{ symbol: string; error: string }> = [];
    const ttlSeconds = portfolioOpportunityTtlSeconds(payload.strategy);

    for (const symbol of symbolsToAnalyze) {
      try {
        const opportunity = await analyzeOne(symbol, payload.strategy, positions);
        opportunities.push(opportunity);
        if (store) {
          await store.set(payload.strategy, portfolioFingerprint, opportunity, ttlSeconds).catch(() => undefined);
        }
      } catch (error) {
        errors.push({
          symbol,
          error: error instanceof Error ? error.message : 'Unable to analyze symbol',
        });
      }
    }

    opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
    const portfolioValue = positions.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);

    if (store && opportunities.length) {
      const rankingSnapshot: PortfolioRankingSnapshot = {
        generatedAt: new Date().toISOString(),
        strategy: payload.strategy,
        portfolioFingerprint,
        items: opportunities.map((item, index) => ({
          rank: index + 1,
          symbol: item.symbol,
          opportunityScore: item.opportunityScore,
          action: item.action,
          signalPriorityLevel: item.signalPriorityLevel,
          marketRegime: item.marketRegime,
          currentWeightPercent: item.currentWeightPercent,
        })),
      };
      await store.setLatestRanking(rankingSnapshot, ttlSeconds).catch(() => undefined);
    }

    const summary: PortfolioOpportunitySummary = {
      generatedAt: new Date().toISOString(),
      strategy: payload.strategy,
      portfolioValue,
      requested: allSymbols.length,
      batchLimit,
      analyzed: opportunities.length,
      failed: errors.length,
      deferred,
      opportunities,
      allocationPlan: payload.monthlyCapital !== undefined
        ? buildMonthlyAllocationPlan(opportunities, payload.monthlyCapital, payload.maxAllocationIdeas)
        : undefined,
      errors,
    };

    return NextResponse.json({
      ...summary,
      cache: {
        enabled: Boolean(store),
        hits: cached.size,
        refreshed: symbolsToAnalyze.length - errors.length,
        ttlSeconds,
        portfolioFingerprint,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid portfolio request', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to analyze portfolio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
