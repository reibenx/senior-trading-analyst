import type { Decision, ScoreCard, Strategy, TradePlan } from '@/core/domain/trading';

export type PortfolioAction =
  | 'AUMENTAR'
  | 'COMPRAR_EN_PULLBACK'
  | 'MANTENER'
  | 'TOMAR_GANANCIAS'
  | 'REDUCIR'
  | 'REVISAR_TESIS';

export interface PortfolioOpportunity {
  symbol: string;
  strategy: Strategy;
  decision: Decision;
  action: PortfolioAction;
  opportunityScore: number;
  currentWeightPercent: number;
  distanceToEntryPercent?: number;
  scores: ScoreCard;
  currentPrice: number;
  entryLow?: number;
  entryHigh?: number;
  stop?: number;
  target?: number;
  thesis: string[];
  risks: string[];
  plan: TradePlan;
}

export interface PortfolioOpportunitySummary {
  generatedAt: string;
  strategy: Strategy;
  portfolioValue: number;
  analyzed: number;
  failed: number;
  opportunities: PortfolioOpportunity[];
  errors: Array<{ symbol: string; error: string }>;
}
