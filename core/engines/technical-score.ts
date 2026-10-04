import type { TechnicalSnapshot } from '@/core/domain/market';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function calculateTechnicalScore(snapshot: TechnicalSnapshot): number {
  let score = 0;

  score += snapshot.trend === 'BULL' ? 36 : snapshot.trend === 'NEUTRAL' ? 22 : 8;
  score += snapshot.structure === 'HH_HL' ? 24 : snapshot.structure === 'RANGE' ? 14 : 5;

  if (snapshot.rsi14 !== undefined) {
    if (snapshot.rsi14 >= 45 && snapshot.rsi14 <= 65) score += 20;
    else if (snapshot.rsi14 >= 35 && snapshot.rsi14 <= 72) score += 14;
    else score += 7;
  } else {
    score += 10;
  }

  if (snapshot.ema50 !== undefined) {
    score += snapshot.currentPrice > snapshot.ema50 ? 20 : 8;
  } else if (snapshot.ema20 !== undefined) {
    score += snapshot.currentPrice > snapshot.ema20 ? 16 : 8;
  } else {
    score += 10;
  }

  return Math.round(clamp(score));
}
