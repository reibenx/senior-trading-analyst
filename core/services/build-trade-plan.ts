import type { LineOverlay, TechnicalSnapshot, ZoneOverlay } from '@/core/domain/market';
import type { Position, Strategy, TradePlan } from '@/core/domain/trading';
import { decide } from '@/core/engines/decision';
import { calculatePortfolioFit } from '@/core/engines/portfolio-fit';
import { calculateScores } from '@/core/engines/scoring';
import { calculateTechnicalScore } from '@/core/engines/technical-score';
import type { FundamentalScore } from '@/core/domain/fundamentals';
import type { MarketContextSnapshot } from '@/core/domain/market-context';

function lineValue(snapshot: TechnicalSnapshot, id: string): number | undefined {
  const overlay = snapshot.overlays.find(
    (item): item is LineOverlay & { value: number } => item.id === id && item.kind !== 'entry-zone' && typeof item.value === 'number',
  );
  return overlay?.value;
}

function zoneValue(snapshot: TechnicalSnapshot, id: string): ZoneOverlay | undefined {
  return snapshot.overlays.find((item): item is ZoneOverlay => item.id === id && item.kind === 'entry-zone');
}

export interface BuildTradePlanInput {
  strategy: Strategy;
  snapshot: TechnicalSnapshot;
  fundamentalScore?: FundamentalScore | null;
  marketContext?: MarketContextSnapshot | null;
  positions?: Position[];
}

export function buildTradePlan(input: BuildTradePlanInput): TradePlan {
  const { strategy, snapshot } = input;
  const positions = input.positions ?? [];
  const technical = calculateTechnicalScore(snapshot);
  const entryA = zoneValue(snapshot, 'entry-a');
  const entryB = zoneValue(snapshot, 'entry-b');
  const stop = lineValue(snapshot, 'stop');
  const targets = [lineValue(snapshot, 'tp1'), lineValue(snapshot, 'tp2')]
    .filter((target): target is number => target !== undefined);

  const risk = entryA && stop !== undefined ? entryA.high - stop : undefined;
  const reward = entryA && targets[0] !== undefined ? targets[0] - entryA.high : undefined;
  const riskReward = risk !== undefined && reward !== undefined && risk > 0 ? reward / risk : undefined;
  const riskRewardScore = riskReward === undefined ? 50 : Math.round(Math.max(0, Math.min(100, riskReward * 25)));

  const portfolioFit = positions.length
    ? calculatePortfolioFit(positions, snapshot.symbol, 0)
    : null;
  const alreadyOwned = positions.some(
    (position) => position.symbol.toUpperCase() === snapshot.symbol.toUpperCase() && position.quantity > 0,
  );

  const scores = calculateScores(strategy, {
    technical,
    fundamental: input.fundamentalScore?.total ?? 50,
    valuation: input.fundamentalScore?.valuation ?? 50,
    market: input.marketContext?.score ?? 50,
    riskReward: riskRewardScore,
    portfolioFit: portfolioFit?.portfolioFitScore ?? 50,
  });

  const decision = decide({ strategy, scores, technical: snapshot, alreadyOwned });

  return {
    symbol: snapshot.symbol,
    strategy,
    decision: decision.decision,
    scores,
    currentPrice: snapshot.currentPrice,
    entryA: entryA ? { low: entryA.low, high: entryA.high } : undefined,
    entryB: entryB ? { low: entryB.low, high: entryB.high } : undefined,
    invalidation: stop,
    stop,
    targets,
    riskReward,
    thesis: decision.reasons,
    risks: decision.warnings,
    invalidationConditions: [
      'Pérdida del stop técnico o ruptura de la estructura que sostiene la tesis.',
      'Deterioro fundamental material.',
      'Cambio adverso relevante del régimen de mercado o sector.',
    ],
    generatedAt: new Date().toISOString(),
  };
}
