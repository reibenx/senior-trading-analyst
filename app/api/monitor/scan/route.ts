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
import { enrichOpportunityWithThesis2027Events } from '@/core/services/thesis-2027-events';
import { getThesis2027Overlay } from '@/core/engines/thesis-2027';
import { buildPortfolioOpportunity } from '@/core/engines/opportunity';
import { buildTransversalRanking } from '@/core/engines/transversal-ranking';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import {
  marketScannerBatchSize,
  marketScannerEnabled,
  marketScannerFastTrackScore,
  marketScannerMinConfirmations,
  marketScannerPromotionLimit,
  marketScannerThreshold,
  parseScannerUniverse,
  preScoreTechnicalCandidate,
  scannerDiscoveryPriority,
  scannerPromotionEligible,
} from '@/core/monitoring/market-scanner';
import {
  buildScannerDiscoveryState,
  getScannerHistoryStore,
  type ScannerDiscoveryState,
} from '@/core/monitoring/scanner-history-store';
import { appendActivity } from '@/core/persistence/activity-store';
import {
  buildPortfolioFingerprint,
  getPortfolioOpportunityStore,
  portfolioOpportunityTtlSeconds,
} from '@/core/persistence/portfolio-opportunity-store';
import {
  buildThesis2027HistoryState,
  getThesis2027HistoryStore,
} from '@/core/persistence/thesis-2027-history-store';

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
  const baseTargets = dedupeTargets([...watchlistTargets, ...portfolioTargets]);
  const portfolioSymbols = new Set(portfolioTargets.map((target) => target.symbol));
  const marketProvider = getMarketDataProvider();

  const scannerSummary = {
    enabled: marketScannerEnabled(),
    universeSize: 0,
    inspected: 0,
    promoted: [] as Array<{ symbol: string; score: number; reasons: string[]; trend: ScannerDiscoveryState['trend']; scoreDelta?: number; observations: number }>,
    rejected: [] as Array<{ symbol: string; score: number; trend: ScannerDiscoveryState['trend']; scoreDelta?: number; observations: number }>,
    ranked: [] as Array<{ symbol: string; score: number; priority: number; trend: ScannerDiscoveryState['trend']; scoreDelta?: number; observations: number; eligible: boolean; fastTrack: boolean }>,
  };

  const scannerTargets: ScanTarget[] = [];
  let scannerUniverse: string[] = [];
  if (scannerSummary.enabled) {
    const baseSymbols = new Set(baseTargets.map((target) => target.symbol));
    scannerUniverse = parseScannerUniverse(process.env.MARKET_SCANNER_UNIVERSE)
      .filter((symbol) => !baseSymbols.has(symbol));
    scannerSummary.universeSize = scannerUniverse.length;

    const scannerCursor = getMonitorCursorStore('market-scanner');
    const scannerBatch = marketScannerBatchSize();
    const scannerStart = scannerCursor && scannerUniverse.length
      ? await scannerCursor.take(scannerUniverse.length, scannerBatch).catch(() => 0)
      : 0;
    const candidates = circularSlice(scannerUniverse, scannerStart, scannerBatch);
    const threshold = marketScannerThreshold();
    const promotionLimit = marketScannerPromotionLimit();
    const minConfirmations = marketScannerMinConfirmations();
    const fastTrackScore = marketScannerFastTrackScore();
    const historyStore = getScannerHistoryStore();
    const inspectedCandidates: Array<{
      candidate: ReturnType<typeof preScoreTechnicalCandidate>;
      discovery: ScannerDiscoveryState;
      priority: number;
    }> = [];

    for (const symbol of candidates) {
      try {
        const bars = await marketProvider.getBars({
          symbol,
          timeframe: DEFAULT_TIMEFRAME[portfolioStrategy],
          limit: 260,
        });
        const snapshot = buildTechnicalSnapshot({
          symbol,
          timeframe: DEFAULT_TIMEFRAME[portfolioStrategy],
          bars,
        });
        const candidate = preScoreTechnicalCandidate(symbol, snapshot, portfolioStrategy);
        const observedAt = new Date().toISOString();
        const history = historyStore
          ? await historyStore.get(portfolioStrategy, symbol).catch(() => null)
          : null;
        const discovery = buildScannerDiscoveryState(
          symbol,
          portfolioStrategy,
          candidate.score,
          history,
        );
        if (historyStore) {
          await historyStore
            .append(portfolioStrategy, symbol, candidate.score, observedAt)
            .catch(() => undefined);
        }
        inspectedCandidates.push({
          candidate,
          discovery,
          priority: scannerDiscoveryPriority(discovery),
        });
        scannerSummary.inspected += 1;
      } catch {
        scannerSummary.inspected += 1;
      }
    }

    inspectedCandidates.sort((a, b) => b.priority - a.priority);
    scannerSummary.ranked = inspectedCandidates.map(({ candidate, discovery, priority }) => ({
      symbol: candidate.symbol,
      score: candidate.score,
      priority,
      trend: discovery.trend,
      scoreDelta: discovery.scoreDelta,
      observations: discovery.observations,
      eligible: scannerPromotionEligible(discovery, threshold, minConfirmations, fastTrackScore),
      fastTrack: candidate.score >= fastTrackScore && discovery.trend !== 'DETERIORATING',
    }));

    const promotedSymbols = new Set(
      inspectedCandidates
        .filter(({ discovery }) => scannerPromotionEligible(discovery, threshold, minConfirmations, fastTrackScore))
        .slice(0, promotionLimit)
        .map(({ candidate }) => candidate.symbol),
    );

    for (const { candidate, discovery } of inspectedCandidates) {
      if (promotedSymbols.has(candidate.symbol)) {
        scannerTargets.push({ symbol: candidate.symbol, strategy: portfolioStrategy, source: 'SCANNER' });
        scannerSummary.promoted.push({
          symbol: candidate.symbol,
          score: candidate.score,
          reasons: candidate.reasons,
          trend: discovery.trend,
          scoreDelta: discovery.scoreDelta,
          observations: discovery.observations,
        });
      } else {
        scannerSummary.rejected.push({
          symbol: candidate.symbol,
          score: candidate.score,
          trend: discovery.trend,
          scoreDelta: discovery.scoreDelta,
          observations: discovery.observations,
        });
      }
    }
  }

  const rankingTargets = dedupeTargets([
    ...baseTargets,
    ...scannerUniverse.map((symbol) => ({
      symbol,
      strategy: portfolioStrategy,
      source: 'SCANNER' as const,
    })),
  ]);

  const sourceBySymbol = new Map<string, 'PORTFOLIO' | 'WATCHLIST' | 'SCANNER'>();
  const promotedScannerSymbols = new Set(scannerSummary.promoted.map((item) => item.symbol));
  const discoveryBySymbol = new Map<string, {
    score: number;
    scoreDelta?: number;
    observations: number;
    trend: ScannerDiscoveryState['trend'];
    priority: number;
    promoted: boolean;
    eligible: boolean;
    fastTrack: boolean;
  }>();
  for (const item of scannerSummary.ranked) {
    discoveryBySymbol.set(item.symbol, {
      score: item.score,
      scoreDelta: item.scoreDelta,
      observations: item.observations,
      trend: item.trend,
      priority: item.priority,
      promoted: promotedScannerSymbols.has(item.symbol),
      eligible: item.eligible,
      fastTrack: item.fastTrack,
    });
  }
  for (const target of rankingTargets) {
    sourceBySymbol.set(
      target.symbol,
      portfolioSymbols.has(target.symbol)
        ? 'PORTFOLIO'
        : target.source === 'SCANNER'
          ? 'SCANNER'
          : 'WATCHLIST',
    );
  }

  const maxSymbols = configuredBatchSize(marketProvider.id);
  const cursorStore = getMonitorCursorStore();
  const startIndex = cursorStore && baseTargets.length
    ? await cursorStore.take(baseTargets.length, maxSymbols).catch(() => 0)
    : 0;
  const scanTargets = [
    ...circularSlice(baseTargets, startIndex, maxSymbols),
    ...scannerTargets,
  ];

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
        includeFundamentals: !getThesis2027Overlay(target.symbol).themes.includes('OTHER'),
      });

      const plan = buildTradePlan({
        strategy: target.strategy,
        snapshot: analysis.snapshot,
        fundamentalScore: analysis.fundamentalScore,
        marketContext: analysis.marketContext,
        positions,
      });

      const rawOpportunity = buildPortfolioOpportunity(plan, positions);
      const opportunity = await enrichOpportunityWithThesis2027Events(rawOpportunity, analysis.fundamentals);
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
  if (opportunityStore && rankingTargets.length) {
    try {
      const previousTransversalRanking = await opportunityStore
        .getTransversalRanking(portfolioFingerprint)
        .catch(() => null);
      const grouped = new Map<Strategy, string[]>();
      for (const target of rankingTargets) {
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
        totalSymbols: rankingTargets.length,
        portfolioFingerprint,
        previousRanking: previousTransversalRanking,
        sourceBySymbol,
        discoveryBySymbol,
      });

      const thesisHistoryStore = getThesis2027HistoryStore();
      if (thesisHistoryStore) {
        const observedAt = transversalRanking.generatedAt;
        for (const item of transversalRanking.items) {
          if (!item.thesis2027Themes || item.thesis2027Themes.includes('OTHER') || item.thesis2027Adjustment === undefined) continue;
          const observation = {
            observedAt,
            adjustment: item.thesis2027Adjustment,
            evidenceStatus: item.thesis2027EvidenceStatus,
            eventStatus: item.thesis2027EventStatus,
            dynamicAdjustment: item.thesis2027DynamicAdjustment,
            eventAdjustment: item.thesis2027EventAdjustment,
            structuredAdjustment: item.thesis2027StructuredAdjustment,
          };
          const history = await thesisHistoryStore.get(item.symbol).catch(() => null);
          const state = buildThesis2027HistoryState(item.symbol, observation, history);
          item.thesis2027HistoryTrend = state.trend;
          item.thesis2027HistoryObservations = state.observations;
          item.thesis2027AdjustmentDelta = state.adjustmentDelta;
          item.thesis2027RegimeChanged = state.regimeChanged;
          item.thesis2027PreviousEvidenceStatus = state.previousEvidenceStatus;
          item.thesis2027FirstObservedAt = state.firstObservedAt;
          await thesisHistoryStore.append(item.symbol, observation).catch(() => undefined);

          const materialShift = state.regimeChanged || Math.abs(state.adjustmentDelta ?? 0) >= 3;
          if (materialShift && state.previousAdjustment !== undefined) {
            const event: AlertEvent = {
              id: `thesis-regime:${item.symbol}:${observedAt}`,
              symbol: item.symbol,
              severity: state.trend === 'WEAKENING' ? 'WATCH' : 'OPPORTUNITY',
              type: 'THESIS_2027_REGIME_CHANGED',
              title: state.trend === 'WEAKENING' ? 'Tesis 2027 se debilita' : 'Tesis 2027 cambia de régimen',
              message: `${item.symbol}: ajuste ${state.previousAdjustment} → ${state.currentAdjustment}${state.previousEvidenceStatus && state.currentEvidenceStatus ? ` · ${state.previousEvidenceStatus} → ${state.currentEvidenceStatus}` : ''}`,
              createdAt: observedAt,
              metadata: {
                dedupKey: `thesis-regime:${item.symbol}:${state.previousEvidenceStatus ?? 'none'}:${state.currentEvidenceStatus ?? 'none'}:${state.currentAdjustment}`,
                previousAdjustment: state.previousAdjustment,
                currentAdjustment: state.currentAdjustment,
                adjustmentDelta: state.adjustmentDelta,
                trend: state.trend,
                previousEvidenceStatus: state.previousEvidenceStatus,
                currentEvidenceStatus: state.currentEvidenceStatus,
              },
            };
            const acquired = stateStore
              ? await stateStore.acquire(event, alertTtlSeconds()).catch(() => true)
              : true;
            if (acquired) {
              await Promise.allSettled(providers.map((provider) => provider.send(event)));
              await appendActivity({
                kind: 'SIGNAL',
                symbol: item.symbol,
                title: event.title,
                detail: event.message,
                severity: event.severity,
                metadata: event.metadata,
                createdAt: event.createdAt,
              }).catch(() => undefined);
            }
          }
        }
      }

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
    totalTargets: rankingTargets.length,
    nextBatchWillRotate: Boolean(cursorStore && baseTargets.length > Math.max(0, scanTargets.length - scannerTargets.length)),
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
