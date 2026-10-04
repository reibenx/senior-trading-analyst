import type { Position } from '@/core/domain/trading';

export interface PortfolioFitResult {
  totalMarketValue: number;
  symbol: string;
  currentWeightPercent: number;
  projectedWeightPercent?: number;
  concentrationScore: number;
  portfolioFitScore: number;
  reasons: string[];
  positions: Position[];
}
