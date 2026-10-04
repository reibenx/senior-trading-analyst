import type { ScoreCard, Strategy } from '../domain/trading';

type Inputs = Omit<ScoreCard, 'conviction'>;

const WEIGHTS: Record<Strategy, Record<keyof Inputs, number>> = {
  day: { technical: 0.35, fundamental: 0.03, valuation: 0.02, market: 0.15, riskReward: 0.30, portfolioFit: 0.15 },
  swing: { technical: 0.30, fundamental: 0.15, valuation: 0.10, market: 0.15, riskReward: 0.20, portfolioFit: 0.10 },
  position: { technical: 0.15, fundamental: 0.25, valuation: 0.20, market: 0.15, riskReward: 0.10, portfolioFit: 0.15 }
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function calculateScores(strategy: Strategy, inputs: Inputs): ScoreCard {
  const weights = WEIGHTS[strategy];
  const conviction = (Object.keys(weights) as (keyof Inputs)[])
    .reduce((sum, key) => sum + clamp(inputs[key]) * weights[key], 0);

  return { ...inputs, conviction: Math.round(conviction) };
}

export function getStrategyWeights(strategy: Strategy) {
  return { ...WEIGHTS[strategy] };
}
