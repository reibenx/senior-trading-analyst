import type { PortfolioOpportunity, ScannerDiscoveryTrend, TransversalRankingSnapshot } from '@/core/domain/opportunity';

interface Input {
  opportunities: PortfolioOpportunity[];
  totalSymbols: number;
  portfolioFingerprint: string;
  previousRanking?: TransversalRankingSnapshot | null;
  sourceBySymbol?: Map<string, 'PORTFOLIO' | 'WATCHLIST' | 'SCANNER'>;
  discoveryBySymbol?: Map<string, {
    score: number;
    scoreDelta?: number;
    observations: number;
    trend: ScannerDiscoveryTrend;
  }>;
}

function dataQuality(item: PortfolioOpportunity): 'FULL' | 'PARTIAL' | 'LIMITED' {
  const hasMarket = item.contextCoverage === 'FULL' || item.contextCoverage === 'BENCHMARK_ONLY';
  const hasValuationSignal = item.scores.valuation !== 50 || item.scores.fundamental !== 50;
  if (item.contextCoverage === 'FULL' && hasValuationSignal) return 'FULL';
  if (hasMarket || hasValuationSignal) return 'PARTIAL';
  return 'LIMITED';
}

function adjustedScore(item: PortfolioOpportunity) {
  let score = item.opportunityScore;
  const quality = dataQuality(item);

  if (quality === 'PARTIAL') score -= 3;
  if (quality === 'LIMITED') score -= 7;

  if (item.currentWeightPercent >= 20) score -= 12;
  else if (item.currentWeightPercent >= 15) score -= 7;
  else if (item.currentWeightPercent >= 10) score -= 3;

  if (item.marketRegime === 'DEFENSIVE' && (item.action === 'AUMENTAR' || item.action === 'COMPRAR_EN_PULLBACK')) score -= 12;
  if (item.signalPriorityLevel === 'HIGH') score += 3;
  if (item.signalPriorityLevel === 'CRITICAL' && item.action !== 'REDUCIR' && item.action !== 'REVISAR_TESIS') score += 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildTransversalRanking(input: Input): TransversalRankingSnapshot {
  const ranked = input.opportunities
    .map((item) => {
      const score = adjustedScore(item);
      const quality = dataQuality(item);
      const eligibleForNewCapital =
        (item.action === 'AUMENTAR' || item.action === 'COMPRAR_EN_PULLBACK')
        && item.currentWeightPercent < 20
        && item.marketRegime !== 'DEFENSIVE'
        && item.signalPriorityLevel !== 'LOW'
        && score >= 65;

      const notes: string[] = [];
      if (quality !== 'FULL') notes.push('Cobertura de datos parcial: evitar sobreinterpretar valoración/correlación.');
      if (item.contextCoverage !== 'FULL') notes.push('Sin confirmación sectorial completa.');
      if (item.currentWeightPercent >= 15) notes.push('Concentración actual elevada; se penaliza nuevo capital.');
      if (item.marketRegime === 'DEFENSIVE') notes.push('Régimen defensivo: compras penalizadas.');
      if (item.distanceToEntryPercent !== undefined && item.distanceToEntryPercent > 4) notes.push('Precio alejado de la zona preferida; priorizar pullback.');

      return {
        symbol: item.symbol,
        strategy: item.strategy,
        action: item.action,
        opportunityScore: item.opportunityScore,
        adjustedScore: score,
        signalPriorityLevel: item.signalPriorityLevel,
        signalPriorityScore: item.signalPriorityScore,
        marketRegime: item.marketRegime,
        contextCoverage: item.contextCoverage,
        currentWeightPercent: item.currentWeightPercent,
        valuationScore: item.scores.valuation,
        technicalScore: item.scores.technical,
        conviction: item.scores.conviction,
        eligibleForNewCapital,
        dataQuality: quality,
        notes,
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .map((item, index) => {
      const rank = index + 1;
      const previous = input.previousRanking?.items.find(
        (candidate) => candidate.symbol === item.symbol && candidate.strategy === item.strategy,
      );
      const rankChange = previous ? previous.rank - rank : undefined;
      const movement = !previous
        ? 'NEW' as const
        : rankChange === 0
          ? 'UNCHANGED' as const
          : rankChange && rankChange > 0
            ? 'UP' as const
            : 'DOWN' as const;

      const baseSource = input.sourceBySymbol?.get(item.symbol.toUpperCase()) ?? 'WATCHLIST';
      const source = baseSource === 'PORTFOLIO'
        ? 'PORTFOLIO' as const
        : baseSource === 'SCANNER'
          ? 'NEW_OPPORTUNITY' as const
          : movement === 'NEW'
            ? 'NEW_OPPORTUNITY' as const
            : 'WATCHLIST' as const;

      const discovery = input.discoveryBySymbol?.get(item.symbol.toUpperCase());

      return {
        ...item,
        rank,
        previousRank: previous?.rank,
        rankChange,
        movement,
        source,
        discoveryTrend: discovery?.trend,
        discoveryScore: discovery?.score,
        discoveryScoreDelta: discovery?.scoreDelta,
        discoveryObservations: discovery?.observations,
      };
    });

  const coveredSymbols = ranked.length;
  const coveragePercent = input.totalSymbols > 0 ? Math.round((coveredSymbols / input.totalSymbols) * 100) : 0;
  const previousLeader = input.previousRanking?.items.find((item) => item.eligibleForNewCapital)?.symbol;
  const currentLeader = ranked.find((item) => item.eligibleForNewCapital)?.symbol;
  const sourceCounts = {
    portfolio: ranked.filter((item) => item.source === 'PORTFOLIO').length,
    watchlist: ranked.filter((item) => item.source === 'WATCHLIST').length,
    newOpportunities: ranked.filter((item) => item.source === 'NEW_OPPORTUNITY').length,
  };
  const leaderChange = {
    changed: Boolean(input.previousRanking && previousLeader !== currentLeader),
    previousSymbol: previousLeader,
    currentSymbol: currentLeader,
  };

  return {
    generatedAt: new Date().toISOString(),
    previousGeneratedAt: input.previousRanking?.generatedAt,
    portfolioFingerprint: input.portfolioFingerprint,
    leaderChange,
    coveredSymbols,
    totalSymbols: input.totalSymbols,
    coveragePercent,
    sourceCounts,
    items: ranked,
    notes: [
      'Ranking transversal del monitor: consolida lotes rotativos y penaliza concentración, contexto adverso y cobertura incompleta.',
      'La correlación sectorial sólo debe ponderarse cuando exista sector real; no se infiere ni se inventa.',
      'Los scores de valoración/fundamentales pueden ser neutrales cuando el monitor opera sin proveedor fundamental para preservar cuota.',
    ],
  };
}
