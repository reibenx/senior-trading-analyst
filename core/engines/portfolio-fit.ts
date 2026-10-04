import type { PortfolioFitResult } from '@/core/domain/portfolio';
import type { Position } from '@/core/domain/trading';

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculatePortfolioFit(
  positions: Position[],
  symbol: string,
  proposedAdditionValue = 0,
): PortfolioFitResult {
  const normalized = symbol.toUpperCase();
  const values = positions.map((position) => Math.max(0, position.marketValue ?? 0));
  const totalMarketValue = values.reduce((sum, value) => sum + value, 0);
  const currentValue = positions.reduce((sum, position) => (
    position.symbol.toUpperCase() === normalized ? sum + Math.max(0, position.marketValue ?? 0) : sum
  ), 0);

  const currentWeightPercent = totalMarketValue > 0 ? (currentValue / totalMarketValue) * 100 : 0;
  const projectedTotal = totalMarketValue + Math.max(0, proposedAdditionValue);
  const projectedWeightPercent = projectedTotal > 0
    ? ((currentValue + Math.max(0, proposedAdditionValue)) / projectedTotal) * 100
    : undefined;

  const weights = totalMarketValue > 0 ? values.map((value) => value / totalMarketValue) : [];
  const hhi = weights.reduce((sum, weight) => sum + weight ** 2, 0);
  const concentrationScore = clamp(100 - hhi * 220);

  const referenceWeight = projectedWeightPercent ?? currentWeightPercent;
  let portfolioFitScore = 85;
  if (referenceWeight >= 25) portfolioFitScore = 15;
  else if (referenceWeight >= 20) portfolioFitScore = 25;
  else if (referenceWeight >= 15) portfolioFitScore = 40;
  else if (referenceWeight >= 10) portfolioFitScore = 58;
  else if (referenceWeight >= 7.5) portfolioFitScore = 70;

  portfolioFitScore = Math.round(clamp(portfolioFitScore * 0.75 + concentrationScore * 0.25));

  const reasons: string[] = [];
  reasons.push(`Peso actual de ${normalized}: ${currentWeightPercent.toFixed(1)}%.`);
  if (projectedWeightPercent !== undefined) reasons.push(`Peso proyectado: ${projectedWeightPercent.toFixed(1)}%.`);
  if (referenceWeight >= 15) reasons.push('La nueva exposición incrementaría una concentración relevante.');
  else if (referenceWeight < 7.5) reasons.push('La posición mantiene margen de diversificación por tamaño.');
  reasons.push(`Concentración global estimada: ${concentrationScore}/100.`);

  return {
    totalMarketValue,
    symbol: normalized,
    currentWeightPercent: Math.round(currentWeightPercent * 10) / 10,
    projectedWeightPercent: projectedWeightPercent === undefined ? undefined : Math.round(projectedWeightPercent * 10) / 10,
    concentrationScore: Math.round(concentrationScore),
    portfolioFitScore,
    reasons,
    positions,
  };
}
