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
  signalPriorityScore?: number;
  signalPriorityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  marketRegime?: 'RISK_ON' | 'MIXED' | 'DEFENSIVE' | 'UNKNOWN';
  contextCoverage?: 'FULL' | 'BENCHMARK_ONLY' | 'NONE';
  preferredEntry?: 'A' | 'B';
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

export interface MonthlyAllocationItem {
  symbol: string;
  allocationPercent: number;
  allocationAmount: number;
  opportunityScore: number;
  currentWeightPercent: number;
  rationale: string;
}

export interface MonthlyAllocationPlan {
  capital: number;
  currency: 'USD';
  allocated: number;
  cashReserve: number;
  items: MonthlyAllocationItem[];
  notes: string[];
}

export interface PortfolioOpportunitySummary {
  generatedAt: string;
  strategy: Strategy;
  portfolioValue: number;
  requested?: number;
  batchLimit?: number;
  analyzed: number;
  failed: number;
  deferred?: string[];
  opportunities: PortfolioOpportunity[];
  allocationPlan?: MonthlyAllocationPlan;
  errors: Array<{ symbol: string; error: string }>;
  cache?: {
    enabled: boolean;
    hits: number;
    refreshed: number;
    ttlSeconds: number;
    portfolioFingerprint: string;
  };
}
