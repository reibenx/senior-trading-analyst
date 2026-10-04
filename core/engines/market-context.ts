import type { MarketContextSnapshot } from '@/core/domain/market-context';
import type { TechnicalSnapshot } from '@/core/domain/market';

const SECTOR_ETF: Record<string, string> = {
  TECHNOLOGY: 'XLK',
  'INFORMATION TECHNOLOGY': 'XLK',
  HEALTHCARE: 'XLV',
  'HEALTH CARE': 'XLV',
  FINANCIALS: 'XLF',
  'FINANCIAL SERVICES': 'XLF',
  INDUSTRIALS: 'XLI',
  ENERGY: 'XLE',
  UTILITIES: 'XLU',
  'REAL ESTATE': 'XLRE',
  MATERIALS: 'XLB',
  'BASIC MATERIALS': 'XLB',
  'CONSUMER CYCLICAL': 'XLY',
  'CONSUMER DISCRETIONARY': 'XLY',
  'CONSUMER DEFENSIVE': 'XLP',
  'CONSUMER STAPLES': 'XLP',
  'COMMUNICATION SERVICES': 'XLC',
};

function trendPoints(trend: TechnicalSnapshot['trend']): number {
  if (trend === 'BULL') return 100;
  if (trend === 'BEAR') return 20;
  return 55;
}

export function getSectorEtf(sector?: string): string | undefined {
  if (!sector) return undefined;
  return SECTOR_ETF[sector.trim().toUpperCase()];
}

export function buildMarketContext(
  benchmark: TechnicalSnapshot,
  sector?: TechnicalSnapshot,
): MarketContextSnapshot {
  const benchmarkScore = trendPoints(benchmark.trend);
  const sectorScore = sector ? trendPoints(sector.trend) : 50;
  const score = Math.round(benchmarkScore * 0.65 + sectorScore * 0.35);
  const reasons: string[] = [];

  reasons.push(`SPY ${benchmark.trend.toLowerCase()} en el marco de contexto.`);
  if (sector) reasons.push(`${sector.symbol} ${sector.trend.toLowerCase()} como proxy sectorial.`);
  else reasons.push('Sin ETF sectorial disponible: componente sector neutral.');

  return {
    benchmarkSymbol: benchmark.symbol,
    benchmarkTrend: benchmark.trend,
    sectorSymbol: sector?.symbol,
    sectorTrend: sector?.trend,
    score,
    reasons,
  };
}
