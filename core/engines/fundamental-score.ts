import type { FundamentalScore, FundamentalSnapshot } from '@/core/domain/fundamentals';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function scoreRatio(value: number | undefined, bands: Array<[number, number]>): number {
  if (value === undefined) return 50;
  for (const [limit, score] of bands) {
    if (value <= limit) return score;
  }
  return bands[bands.length - 1]?.[1] ?? 50;
}

export function calculateFundamentalScore(snapshot: FundamentalSnapshot): FundamentalScore {
  const roe = snapshot.returnOnEquity ?? 0;
  const profitMargin = snapshot.profitMargin ?? 0;
  const operatingMargin = snapshot.operatingMargin ?? 0;

  const quality = clamp(
    35 +
      Math.min(30, Math.max(-10, roe * 100)) +
      Math.min(20, Math.max(-10, profitMargin * 100 * 0.8)) +
      Math.min(15, Math.max(-10, operatingMargin * 100 * 0.6)),
  );

  const revenueGrowth = snapshot.revenueGrowthYoY ?? 0;
  const earningsGrowth = snapshot.earningsGrowthYoY ?? 0;
  const growth = clamp(50 + revenueGrowth * 100 * 0.9 + earningsGrowth * 100 * 0.7);

  const forwardPeScore = scoreRatio(snapshot.forwardPE ?? snapshot.trailingPE, [
    [12, 90], [18, 80], [25, 68], [35, 55], [50, 40], [Infinity, 25],
  ]);
  const pegScore = scoreRatio(snapshot.pegRatio, [
    [1, 90], [1.5, 78], [2, 65], [3, 48], [Infinity, 30],
  ]);
  const evEbitdaScore = scoreRatio(snapshot.evToEbitda, [
    [10, 88], [15, 75], [22, 60], [30, 45], [Infinity, 30],
  ]);

  const valuation = Math.round((forwardPeScore * 0.45) + (pegScore * 0.30) + (evEbitdaScore * 0.25));
  const total = Math.round(quality * 0.4 + growth * 0.35 + valuation * 0.25);

  return {
    quality: Math.round(quality),
    growth: Math.round(growth),
    valuation,
    total,
  };
}
