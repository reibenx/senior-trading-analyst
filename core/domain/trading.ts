export type Strategy = 'day' | 'swing' | 'position';
export type Decision = 'STRONG_ADD' | 'ADD' | 'HOLD' | 'TAKE_PROFIT' | 'REDUCE' | 'EXIT';
export type AlertSeverity = 'INFO' | 'WATCH' | 'OPPORTUNITY' | 'ACTION' | 'CRITICAL';

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice?: number;
  marketValue?: number;
  currency: string;
  broker?: string;
}

export interface ScoreCard {
  technical: number;
  fundamental: number;
  valuation: number;
  market: number;
  riskReward: number;
  portfolioFit: number;
  conviction: number;
}

export interface PriceZone {
  low: number;
  high: number;
}

export interface TradePlan {
  symbol: string;
  strategy: Strategy;
  decision: Decision;
  scores: ScoreCard;
  currentPrice: number;
  entryA?: PriceZone;
  entryB?: PriceZone;
  exceptionalEntry?: PriceZone;
  invalidation?: number;
  stop?: number;
  targets: number[];
  riskReward?: number;
  positionSize?: number;
  thesis: string[];
  risks: string[];
  invalidationConditions: string[];
  generatedAt: string;
}

export interface AlertEvent {
  id: string;
  symbol: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
