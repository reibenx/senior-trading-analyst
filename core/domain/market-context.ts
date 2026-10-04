export interface MarketContextSnapshot {
  benchmarkSymbol: string;
  benchmarkTrend: 'BULL' | 'NEUTRAL' | 'BEAR';
  sectorSymbol?: string;
  sectorTrend?: 'BULL' | 'NEUTRAL' | 'BEAR';
  score: number;
  reasons: string[];
}
