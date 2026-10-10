import type { Decision, ScoreCard, Strategy, TradePlan } from '@/core/domain/trading';

export type PortfolioAction =
  | 'AUMENTAR'
  | 'COMPRAR_EN_PULLBACK'
  | 'MANTENER'
  | 'TOMAR_GANANCIAS'
  | 'REDUCIR'
  | 'REVISAR_TESIS';

export interface OpportunityScoreBreakdown {
  conviction: number;
  signalPriority: number;
  portfolioFit: number;
  valuation: number;
  entryProximity: number;
  market: number;
  regimeAdjustment: number;
  contextAdjustment: number;
  concentrationPenalty: number;
}

export interface PortfolioOpportunity {
  symbol: string;
  strategy: Strategy;
  decision: Decision;
  action: PortfolioAction;
  opportunityScore: number;
  scoreBreakdown?: OpportunityScoreBreakdown;
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


export interface PortfolioRankingSnapshotItem {
  rank: number;
  symbol: string;
  opportunityScore: number;
  action: PortfolioAction;
  signalPriorityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  marketRegime?: 'RISK_ON' | 'MIXED' | 'DEFENSIVE' | 'UNKNOWN';
  currentWeightPercent: number;
}

export interface PortfolioRankingSnapshot {
  generatedAt: string;
  strategy: Strategy;
  portfolioFingerprint: string;
  items: PortfolioRankingSnapshotItem[];
}

export type RankingMovement = 'NEW' | 'UP' | 'DOWN' | 'UNCHANGED';
export type OpportunityUniverseSource = 'PORTFOLIO' | 'WATCHLIST' | 'NEW_OPPORTUNITY';
export type ScannerDiscoveryTrend = 'ACCELERATING' | 'STABLE' | 'DETERIORATING';

export interface TransversalRankingItem {
  rank: number;
  previousRank?: number;
  rankChange?: number;
  movement: RankingMovement;
  source: OpportunityUniverseSource;
  discoveryTrend?: ScannerDiscoveryTrend;
  discoveryScore?: number;
  discoveryScoreDelta?: number;
  discoveryObservations?: number;
  symbol: string;
  strategy: Strategy;
  action: PortfolioAction;
  opportunityScore: number;
  adjustedScore: number;
  signalPriorityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  signalPriorityScore?: number;
  marketRegime?: 'RISK_ON' | 'MIXED' | 'DEFENSIVE' | 'UNKNOWN';
  contextCoverage?: 'FULL' | 'BENCHMARK_ONLY' | 'NONE';
  currentWeightPercent: number;
  valuationScore: number;
  technicalScore: number;
  conviction: number;
  eligibleForNewCapital: boolean;
  dataQuality: 'FULL' | 'PARTIAL' | 'LIMITED';
  notes: string[];
}

export interface TransversalRankingLeaderChange {
  changed: boolean;
  previousSymbol?: string;
  currentSymbol?: string;
}

export interface TransversalRankingSourceCounts {
  portfolio: number;
  watchlist: number;
  newOpportunities: number;
}

export interface TransversalRankingSnapshot {
  generatedAt: string;
  previousGeneratedAt?: string;
  portfolioFingerprint: string;
  leaderChange: TransversalRankingLeaderChange;
  coveredSymbols: number;
  totalSymbols: number;
  coveragePercent: number;
  sourceCounts: TransversalRankingSourceCounts;
  items: TransversalRankingItem[];
  notes: string[];
}
