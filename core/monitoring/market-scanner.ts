import type { TechnicalSnapshot } from '@/core/domain/market';
import type { Strategy } from '@/core/domain/trading';
import type { ScannerDiscoveryState } from '@/core/monitoring/scanner-history-store';

export interface ScannerCandidate {
  symbol: string;
  strategy: Strategy;
  score: number;
  reasons: string[];
}

export const DEFAULT_MARKET_SCANNER_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','AVGO','TSM','AMD','NFLX',
  'JPM','V','MA','LLY','COST','WMT','XOM','CVX','UNH','CAT',
];

export function parseScannerUniverse(raw?: string): string[] {
  const values = raw?.trim()
    ? raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_MARKET_SCANNER_UNIVERSE;
  return [...new Set(values)].slice(0, 100);
}

export function marketScannerEnabled(): boolean {
  const raw = process.env.MARKET_SCANNER_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function marketScannerBatchSize(): number {
  const configured = Number(process.env.MARKET_SCANNER_BATCH_SIZE ?? '2');
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

export function marketScannerThreshold(): number {
  const configured = Number(process.env.MARKET_SCANNER_MIN_SCORE ?? '66');
  if (!Number.isFinite(configured)) return 66;
  return Math.max(50, Math.min(90, Math.floor(configured)));
}

export function marketScannerPromotionLimit(): number {
  const configured = Number(process.env.MARKET_SCANNER_PROMOTION_LIMIT ?? '1');
  if (!Number.isFinite(configured)) return 1;
  return Math.max(1, Math.min(2, Math.floor(configured)));
}

export function marketScannerMinConfirmations(): number {
  const configured = Number(process.env.MARKET_SCANNER_MIN_CONFIRMATIONS ?? '2');
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

export function marketScannerFastTrackScore(): number {
  const configured = Number(process.env.MARKET_SCANNER_FAST_TRACK_SCORE ?? '85');
  if (!Number.isFinite(configured)) return 85;
  return Math.max(75, Math.min(100, Math.floor(configured)));
}

export function scannerPromotionEligible(
  state: ScannerDiscoveryState,
  threshold: number,
  minConfirmations: number,
  fastTrackScore: number,
): boolean {
  if (state.score < threshold) return false;
  if (state.trend === 'DETERIORATING') return false;
  if (state.score >= fastTrackScore) return true;
  return state.observations >= minConfirmations;
}

export function scannerDiscoveryPriority(state: ScannerDiscoveryState): number {
  const deltaBoost = state.scoreDelta === undefined
    ? 0
    : Math.max(-8, Math.min(8, state.scoreDelta));
  const trendAdjustment = state.trend === 'ACCELERATING'
    ? 6
    : state.trend === 'DETERIORATING'
      ? -8
      : 0;
  const persistenceBoost = Math.min(4, Math.max(0, state.observations - 1));
  return Math.max(0, Math.min(110, state.score + deltaBoost + trendAdjustment + persistenceBoost));
}

export function preScoreTechnicalCandidate(
  symbol: string,
  snapshot: TechnicalSnapshot,
  strategy: Strategy = 'position',
): ScannerCandidate {
  let score = 50;
  const reasons: string[] = [];

  if (snapshot.trend === 'BULL') {
    score += 18;
    reasons.push('Tendencia alcista');
  } else if (snapshot.trend === 'BEAR') {
    score -= 18;
    reasons.push('Tendencia bajista');
  }

  if (snapshot.structure === 'HH_HL') {
    score += 12;
    reasons.push('Estructura HH/HL');
  } else if (snapshot.structure === 'LH_LL') {
    score -= 12;
    reasons.push('Estructura LH/LL');
  }

  if (snapshot.rsi14 !== undefined) {
    if (snapshot.rsi14 >= 48 && snapshot.rsi14 <= 67) {
      score += 8;
      reasons.push('RSI constructivo');
    } else if (snapshot.rsi14 > 75) {
      score -= 7;
      reasons.push('RSI extendido');
    } else if (snapshot.rsi14 < 35) {
      score -= 5;
      reasons.push('RSI débil');
    }
  }

  if (snapshot.ema21 !== undefined && snapshot.currentPrice > snapshot.ema21) {
    score += 6;
    reasons.push('Precio sobre EMA21');
  }
  if (snapshot.ema50 !== undefined && snapshot.currentPrice > snapshot.ema50) {
    score += 4;
    reasons.push('Precio sobre EMA50');
  }

  return {
    symbol: symbol.toUpperCase(),
    strategy,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}
