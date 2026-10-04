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

function getDistanceToEntry(plan: TradePlan): number | undefined {
  if (!plan.entryA) return undefined;
  if (plan.currentPrice >= plan.entryA.low && plan.currentPrice <= plan.entryA.high) return 0;
  const reference = plan.currentPrice > plan.entryA.high ? plan.entryA.high : plan.entryA.low;
  if (reference <= 0) return undefined;
  return ((plan.currentPrice - reference) / reference) * 100;
}

function classifyAction(plan: TradePlan, opportunityScore: number, distanceToEntryPercent?: number): PortfolioAction {
  if (plan.decision === 'REDUCE' || plan.decision === 'EXIT') return 'REDUCIR';
  if (plan.decision === 'TAKE_PROFIT') return 'TOMAR_GANANCIAS';
  if (plan.decision === 'STRONG_ADD') return 'AUMENTAR';
  if (plan.decision === 'ADD') {
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

  const opportunityScore = Math.round(clamp(
    plan.scores.conviction * 0.55
      + plan.scores.portfolioFit * 0.20
      + plan.scores.valuation * 0.10
      + proximityScore * 0.15
      - concentrationPenalty,
  ));

  return {
    symbol: plan.symbol,
    strategy: plan.strategy,
    decision: plan.decision,
    action: classifyAction(plan, opportunityScore, distanceToEntryPercent),
    opportunityScore,
    currentWeightPercent: Math.round(currentWeightPercent * 10) / 10,
    distanceToEntryPercent: distanceToEntryPercent === undefined
      ? undefined
      : Math.round(distanceToEntryPercent * 10) / 10,
    scores: plan.scores,
    currentPrice: plan.currentPrice,
    entryLow: plan.entryA?.low,
    entryHigh: plan.entryA?.high,
    stop: plan.stop,
    target: plan.targets[0],
    thesis: plan.thesis,
    risks: plan.risks,
    plan,
  };
}
