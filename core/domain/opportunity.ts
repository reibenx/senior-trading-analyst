import type { Decision, ScoreCard, Strategy, TradePlan } from '@/core/domain/trading';
import type { Thesis2027Stance, Thesis2027Theme } from '@/core/domain/thesis-2027';

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
  thesis2027EventStatus?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT';
  thesis2027EventAdjustment?: number;
  thesis2027EventCoverage?: number;
  thesis2027Catalysts?: string[];
  thesis2027EventRisks?: string[];
  thesis2027UpcomingEarningsDate?: string;
  thesis2027StructuredAdjustment?: number;
  thesis2027StructuredCoverage?: number;
  thesis2027StructuredSignals?: Array<{
    category: 'GUIDANCE' | 'ANALYST_REVISION' | 'PRICE_TARGET' | 'CAPEX_AI';
    direction: -1 | 1;
    evidence: string;
  }>;
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
  thesis2027Stance?: Thesis2027Stance;
  thesis2027Themes?: Thesis2027Theme[];
  thesis2027Adjustment?: number;
  thesis2027Rationale?: string;
  thesis2027EvidenceStatus?: 'CONFIRMED' | 'MIXED' | 'WEAK' | 'INSUFFICIENT';
  thesis2027DynamicAdjustment?: number;
  thesis2027EvidenceCoverage?: number;
  thesis2027EvidenceReasons?: string[];
  thesis2027EventStatus?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT';
  thesis2027EventAdjustment?: number;
  thesis2027EventCoverage?: number;
  thesis2027Catalysts?: string[];
  thesis2027EventRisks?: string[];
  thesis2027UpcomingEarningsDate?: string;
  thesis2027StructuredAdjustment?: number;
  thesis2027StructuredCoverage?: number;
  thesis2027StructuredSignals?: Array<{
    category: 'GUIDANCE' | 'ANALYST_REVISION' | 'PRICE_TARGET' | 'CAPEX_AI';
    direction: -1 | 1;
    evidence: string;
  }>;
  thesis2027HistoryTrend?: 'STRENGTHENING' | 'STABLE' | 'WEAKENING';
  thesis2027HistoryObservations?: number;
  thesis2027AdjustmentDelta?: number;
  thesis2027RegimeChanged?: boolean;
  thesis2027PreviousEvidenceStatus?: 'CONFIRMED' | 'MIXED' | 'WEAK' | 'INSUFFICIENT';
  thesis2027FirstObservedAt?: string;
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

export interface ScannerDiscoveryRankingItem {
  rank: number;
  symbol: string;
  score: number;
  priority: number;
  trend: ScannerDiscoveryTrend;
  scoreDelta?: number;
  observations: number;
  eligible?: boolean;
  fastTrack?: boolean;
  promoted: boolean;
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
  discoveryRanking?: ScannerDiscoveryRankingItem[];
  items: TransversalRankingItem[];
  notes: string[];
}
