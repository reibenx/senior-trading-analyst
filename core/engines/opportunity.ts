import type { PortfolioAction, PortfolioOpportunity } from '@/core/domain/opportunity';
import type { Position, TradePlan } from '@/core/domain/trading';

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getCurrentWeight(positions: Position[], symbol: string): number {
  const total = positions.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);
  if (total <= 0) return 0;
  const current = positions
    .filter((position) => position.symbol.toUpperCase() === symbol.toUpperCase())
    .reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);
  return (current / total) * 100;
}

function preferredEntryZone(plan: TradePlan) {
  return plan.riskProfile?.preferredEntry === 'B' ? plan.entryB ?? plan.entryA : plan.entryA ?? plan.entryB;
}

function getDistanceToEntry(plan: TradePlan): number | undefined {
  const zone = preferredEntryZone(plan);
  if (!zone) return undefined;
  if (plan.currentPrice >= zone.low && plan.currentPrice <= zone.high) return 0;
  const reference = plan.currentPrice > zone.high ? zone.high : zone.low;
  if (reference <= 0) return undefined;
  return ((plan.currentPrice - reference) / reference) * 100;
}

function classifyAction(plan: TradePlan, opportunityScore: number, distanceToEntryPercent?: number): PortfolioAction {
  if (plan.decision === 'REDUCE' || plan.decision === 'EXIT') return 'REDUCIR';
  if (plan.decision === 'TAKE_PROFIT') return 'TOMAR_GANANCIAS';

  const priority = plan.signalPriority?.level ?? 'LOW';
  const regime = plan.signalPriority?.marketRegime ?? 'UNKNOWN';
  const weakPriority = priority === 'LOW';
  const adverseRegime = regime === 'DEFENSIVE';

  if (plan.decision === 'STRONG_ADD' || plan.decision === 'ADD') {
    if (weakPriority || adverseRegime) return 'MANTENER';
    if (distanceToEntryPercent !== undefined && distanceToEntryPercent > 4) return 'COMPRAR_EN_PULLBACK';
    return opportunityScore >= 75 ? 'AUMENTAR' : 'COMPRAR_EN_PULLBACK';
  }
  if (plan.scores.conviction < 45) return 'REVISAR_TESIS';
  return 'MANTENER';
}

export function buildPortfolioOpportunity(plan: TradePlan, positions: Position[]): PortfolioOpportunity {
  const currentWeightPercent = getCurrentWeight(positions, plan.symbol);
  const distanceToEntryPercent = getDistanceToEntry(plan);

  const proximityScore = distanceToEntryPercent === undefined
    ? 50
    : clamp(100 - Math.abs(distanceToEntryPercent) * 8);

  const concentrationPenalty = currentWeightPercent >= 20
    ? 35
    : currentWeightPercent >= 15
      ? 20
      : currentWeightPercent >= 10
        ? 10
        : 0;

  const priorityScore = plan.signalPriority?.score ?? 50;
  const regime = plan.signalPriority?.marketRegime ?? 'UNKNOWN';
  const contextCoverage = plan.signalPriority?.contextCoverage ?? 'NONE';
  const bullishDecision = plan.decision === 'STRONG_ADD' || plan.decision === 'ADD';

  const regimeAdjustment = regime === 'RISK_ON'
    ? (bullishDecision ? 5 : 0)
    : regime === 'DEFENSIVE'
      ? (bullishDecision ? -14 : 4)
      : regime === 'MIXED'
        ? (bullishDecision ? -4 : 0)
        : (bullishDecision ? -5 : 0);

  const contextAdjustment = contextCoverage === 'NONE' ? -3 : 0;

  const opportunityScore = Math.round(clamp(
    plan.scores.conviction * 0.30
      + priorityScore * 0.25
      + plan.scores.portfolioFit * 0.15
      + plan.scores.valuation * 0.10
      + proximityScore * 0.10
      + plan.scores.market * 0.10
      + regimeAdjustment
      + contextAdjustment
      - concentrationPenalty,
  ));

  const preferred = preferredEntryZone(plan);

  return {
    symbol: plan.symbol,
    strategy: plan.strategy,
    decision: plan.decision,
    action: classifyAction(plan, opportunityScore, distanceToEntryPercent),
    opportunityScore,
    signalPriorityScore: plan.signalPriority?.score,
    signalPriorityLevel: plan.signalPriority?.level,
    marketRegime: plan.signalPriority?.marketRegime,
    contextCoverage: plan.signalPriority?.contextCoverage,
    preferredEntry: plan.riskProfile?.preferredEntry,
    currentWeightPercent: Math.round(currentWeightPercent * 10) / 10,
    distanceToEntryPercent: distanceToEntryPercent === undefined
      ? undefined
      : Math.round(distanceToEntryPercent * 10) / 10,
    scores: plan.scores,
    currentPrice: plan.currentPrice,
    entryLow: preferred?.low,
    entryHigh: preferred?.high,
    stop: plan.stop,
    target: plan.targets[0],
    thesis: plan.thesis,
    risks: plan.risks,
    plan,
  };
}
