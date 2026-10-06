import { NextResponse } from 'next/server';
import type { AlertEvent, Strategy } from '@/core/domain/trading';
import type { PortfolioOpportunity, TransversalRankingSnapshot } from '@/core/domain/opportunity';
import type { Timeframe } from '@/core/domain/market';
import { MonitoringAgent } from '@/core/monitoring/agent';
import { defaultMonitorRules } from '@/core/monitoring/rules';
import { getAlertStateStore } from '@/core/monitoring/state-store';
import { getAlertPreferences, shouldNotifyAlert } from '@/core/monitoring/preferences';
import { circularSlice, getMonitorCursorStore } from '@/core/monitoring/scan-cursor';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';
import { getMarketDataProvider } from '@/core/providers/market-provider';
import { getNotificationProviders } from '@/core/providers/notifications';
import { analyzeSymbol } from '@/core/services/analyze-symbol';
import { buildTradePlan } from '@/core/services/build-trade-plan';
import { buildPortfolioOpportunity } from '@/core/engines/opportunity';
import { buildTransversalRanking } from '@/core/engines/transversal-ranking';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import {
  marketScannerBatchSize,
  marketScannerEnabled,
  marketScannerThreshold,
  parseScannerUniverse,
  preScoreTechnicalCandidate,
} from '@/core/monitoring/market-scanner';
import { appendActivity } from '@/core/persistence/activity-store';
import {
  buildPortfolioFingerprint,
  getPortfolioOpportunityStore,
  portfolioOpportunityTtlSeconds,
} from '@/core/persistence/portfolio-opportunity-store';

const DEFAULT_TIMEFRAME: Record<Strategy, Timeframe> = {
  day: '15m',
  swing: '1d',
  position: '1w',
};

interface ScanTarget {
  symbol: string;
  strategy: Strategy;
  source?: 'PORTFOLIO' | 'WATCHLIST' | 'SCANNER';
}

function authorized(request: Request): boolean {
  const expected = process.env.MONITOR_CRON_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

function parseStrategy(value?: string): Strategy {
  if (value === 'day' || value === 'swing' || value === 'position') return value;
  return 'position';
}

function parseWatchlist(): ScanTarget[] {
  const raw = process.env.MONITOR_WATCHLIST?.trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [symbol, strategy] = item.split(':').map((part) => part.trim());
      return { symbol: symbol.toUpperCase(), strategy: parseStrategy(strategy), source: 'WATCHLIST' as const };
    })
    .filter((item) => item.symbol.length > 0);
}

function dedupeTargets(targets: ScanTarget[]): ScanTarget[] {
  const map = new Map<string, ScanTarget>();
  for (const target of targets) {
    if (!map.has(target.symbol)) map.set(target.symbol, target);
  }
  return [...map.values()];
}

function alertTtlSeconds(): number {
  const configured = Number(process.env.ALERT_DEDUP_TTL_SECONDS ?? 86400);
  return Number.isFinite(configured) ? Math.max(300, Math.min(604800, Math.floor(configured))) : 86400;
}

function configuredBatchSize(providerId: string): number {
  const fallback = providerId === 'twelve-data' ? 5 : 20;
  const configured = Number(process.env.MONITOR_MAX_SYMBOLS ?? fallback);
  if (!Number.isFinite(configured)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(configured)));
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const broker = getBrokerAdapter();
  const positions = broker ? await broker.getPositions().catch(() => []) : [];
  const portfolioStrategy = parseStrategy(process.env.MONITOR_PORTFOLIO_STRATEGY?.trim());
  const portfolioFingerprint = buildPortfolioFingerprint(positions);
  const opportunityStore = getPortfolioOpportunityStore();
  const rankingSnapshot = opportunityStore
    ? await opportunityStore.getLatestRanking(portfolioStrategy, portfolioFingerprint).catch(() => null)
    : null;
  const rankingBySymbol = new Map((rankingSnapshot?.items ?? []).map((item) => [item.symbol.toUpperCase(), item]));

  const portfolioTargets = positions
    .filter((position) => position.quantity > 0)
    .sort((a, b) => Math.max(0, b.marketValue ?? 0) - Math.max(0, a.marketValue ?? 0))
    .map((position) => ({ symbol: position.symbol.toUpperCase(), strategy: portfolioStrategy, source: 'PORTFOLIO' as const }));

  const watchlistTargets = parseWatchlist();
  const targets = dedupeTargets([...watchlistTargets, ...portfolioTargets]);
  const portfolioSymbols = new Set(portfolioTargets.map((target) => target.symbol));
  const sourceBySymbol = new Map<string, 'PORTFOLIO' | 'WATCHLIST'>();
  for (const target of targets) {
    sourceBySymbol.set(target.symbol, portfolioSymbols.has(target.symbol) ? 'PORTFOLIO' : 'WATCHLIST');
  }
  const marketProvider = getMarketDataProvider();
  const maxSymbols = configuredBatchSize(marketProvider.id);
  const cursorStore = getMonitorCursorStore();
  const startIndex = cursorStore && targets.length
    ? await cursorStore.take(targets.length, maxSymbols).catch(() => 0)
    : 0;
  const scanTargets = circularSlice(targets, startIndex, maxSymbols);

  const providers = getNotificationProviders();
  const stateStore = getAlertStateStore();
  const { preferences: alertPreferences, persistent: persistentAlertPreferences } = await getAlertPreferences().catch(() => ({ preferences: undefined, persistent: false }));
  const agent = new MonitoringAgent(defaultMonitorRules, providers, stateStore, alertTtlSeconds(), alertPreferences ? ((plan, event) => shouldNotifyAlert(plan, event, alertPreferences)) : undefined);
  const results: Array<Record<string, unknown>> = [];

  for (const target of scanTargets) {
    try {
      const analysis = await analyzeSymbol({
        symbol: target.symbol,
        strategy: target.strategy,
        timeframe: DEFAULT_TIMEFRAME[target.strategy],
        includeSectorContext: false,
        includeFundamentals: false,
      });

      const plan = buildTradePlan({
        strategy: target.strategy,
        snapshot: analysis.snapshot,
        fundamentalScore: analysis.fundamentalScore,
        marketContext: analysis.marketContext,
        positions,
      });

      const opportunity = buildPortfolioOpportunity(plan, positions);
      if (opportunityStore) {
        await opportunityStore
          .set(target.strategy, portfolioFingerprint, opportunity, portfolioOpportunityTtlSeconds(target.strategy))
          .catch(() => undefined);
      }

      const events = await agent.evaluate(plan);
      const ranked = target.strategy === portfolioStrategy ? rankingBySymbol.get(target.symbol.toUpperCase()) : undefined;
      results.push({
        symbol: target.symbol,
        strategy: target.strategy,
        decision: plan.decision,
        conviction: plan.scores.conviction,
        riskProfile: plan.riskProfile,
        signalPriority: plan.signalPriority,
        portfolioRank: ranked?.rank,
        portfolioOpportunityScore: ranked?.opportunityScore,
        portfolioAction: ranked?.action,
        events,
      });
    } catch (error) {
      results.push({
        symbol: target.symbol,
        strategy: target.strategy,
        error: error instanceof Error ? error.message : 'Unknown scan error',
      });
    }
  }


  let transversalRanking: TransversalRankingSnapshot | null = null;
  if (opportunityStore && targets.length) {
    try {
      const previousTransversalRanking = await opportunityStore
        .getTransversalRanking(portfolioFingerprint)
        .catch(() => null);
      const grouped = new Map<Strategy, string[]>();
      for (const target of targets) {
        const current = grouped.get(target.strategy) ?? [];
        current.push(target.symbol);
        grouped.set(target.strategy, current);
      }

      const accumulated: PortfolioOpportunity[] = [];
      for (const [strategy, symbols] of grouped) {
        const cached = await opportunityStore.getMany(strategy, portfolioFingerprint, [...new Set(symbols)]);
        accumulated.push(...cached.values());
      }

      transversalRanking = buildTransversalRanking({
        opportunities: accumulated,
        totalSymbols: targets.length,
        portfolioFingerprint,
        previousRanking: previousTransversalRanking,
        sourceBySymbol,
      });

      const rankingTtlSeconds = Math.max(
        30 * 60,
        ...[...grouped.keys()].map((strategy) => portfolioOpportunityTtlSeconds(strategy)),
      );
      await opportunityStore.setTransversalRanking(transversalRanking, rankingTtlSeconds).catch(() => undefined);

      if (transversalRanking.leaderChange.changed && transversalRanking.leaderChange.currentSymbol) {
        const leader = transversalRanking.items.find(
          (item) => item.symbol === transversalRanking?.leaderChange.currentSymbol,
        );
        const previousSymbol = transversalRanking.leaderChange.previousSymbol;
        const currentSymbol = transversalRanking.leaderChange.currentSymbol;
        const event: AlertEvent = {
          id: `new-capital-leader:${previousSymbol ?? 'none'}:${currentSymbol}:${transversalRanking.generatedAt}`,
          symbol: currentSymbol,
          severity: 'OPPORTUNITY',
          type: 'NEW_CAPITAL_LEADER_CHANGED',
          title: 'Cambió el #1 para nuevo capital',
          message: `${previousSymbol ?? '—'} → ${currentSymbol}${leader ? ` · score ajustado ${leader.adjustedScore}/100` : ''}`,
          createdAt: transversalRanking.generatedAt,
          metadata: {
            dedupKey: `new-capital-leader:${previousSymbol ?? 'none'}:${currentSymbol}`,
            previousSymbol,
            currentSymbol,
            adjustedScore: leader?.adjustedScore,
            action: leader?.action,
            movement: leader?.movement,
            rankChange: leader?.rankChange,
            source: leader?.source,
          },
        };

        const acquired = stateStore
          ? await stateStore.acquire(event, alertTtlSeconds()).catch(() => true)
          : true;

        if (acquired) {
          await Promise.allSettled(providers.map((provider) => provider.send(event)));
          await appendActivity({
            kind: 'SIGNAL',
            symbol: currentSymbol,
            title: event.title,
            detail: event.message,
            severity: event.severity,
            metadata: event.metadata,
            createdAt: event.createdAt,
          }).catch(() => undefined);
        }
      }
    } catch {
      transversalRanking = null;
    }
  }

  return NextResponse.json({
    scanned: scanTargets.length,
    batchStart: startIndex,
    totalTargets: targets.length,
    nextBatchWillRotate: Boolean(cursorStore && targets.length > scanTargets.length),
    marketProvider: marketProvider.id,
    portfolioPositions: positions.length,
    notificationProviders: providers.map((provider) => provider.id),
    persistentDeduplication: Boolean(stateStore),
    persistentAlertPreferences,
    alertPreferences,
    ranking: rankingSnapshot ? {
      generatedAt: rankingSnapshot.generatedAt,
      strategy: rankingSnapshot.strategy,
      top3: rankingSnapshot.items.slice(0, 3),
    } : null,
    scanner: scannerSummary,
    transversalRanking,
    results,
  });
}
