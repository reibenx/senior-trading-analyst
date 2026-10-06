import type { MarketContextSnapshot } from '@/core/domain/market-context';
import type { TechnicalSnapshot } from '@/core/domain/market';
import type { Decision, ScoreCard, Strategy } from '@/core/domain/trading';

export type MarketRegime = 'RISK_ON' | 'MIXED' | 'DEFENSIVE' | 'UNKNOWN';
export type SignalPriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ContextCoverage = 'FULL' | 'BENCHMARK_ONLY' | 'NONE';

export interface SignalPriority {
  score: number;
  level: SignalPriorityLevel;
  marketRegime: MarketRegime;
  contextCoverage: ContextCoverage;
  reasons: string[];
}

interface Input {
  strategy: Strategy;
  decision: Decision;
  scores: ScoreCard;
  technical: TechnicalSnapshot;
  marketContext?: MarketContextSnapshot | null;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function regime(context?: MarketContextSnapshot | null): MarketRegime {
  if (!context) return 'UNKNOWN';
  const benchmark = context.benchmarkTrend;
  const sector = context.sectorTrend;
  if (benchmark === 'BULL' && (!sector || sector === 'BULL')) return 'RISK_ON';
  if (benchmark === 'BEAR' && (!sector || sector === 'BEAR')) return 'DEFENSIVE';
  return 'MIXED';
}

function coverage(context?: MarketContextSnapshot | null): ContextCoverage {
  if (!context) return 'NONE';
  return context.sectorSymbol && context.sectorTrend ? 'FULL' : 'BENCHMARK_ONLY';
}

function level(score: number, decision: Decision): SignalPriorityLevel {
  if (decision === 'EXIT' || score >= 85) return 'CRITICAL';
  if (score >= 72) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  return 'LOW';
}

export function calculateSignalPriority(input: Input): SignalPriority {
  const { decision, scores, technical, marketContext } = input;
  const marketRegime = regime(marketContext);
  const contextCoverage = coverage(marketContext);
  const reasons: string[] = [];

  let score =
    scores.conviction * 0.35 +
    scores.technical * 0.20 +
    scores.market * 0.20 +
    scores.riskReward * 0.15 +
    scores.portfolioFit * 0.10;

  const bullishDecision = decision === 'STRONG_ADD' || decision === 'ADD';
  const defensiveDecision = decision === 'REDUCE' || decision === 'EXIT';

  if (technical.trend === 'BULL' && technical.structure === 'HH_HL') {
    score += bullishDecision ? 8 : 2;
    reasons.push('Estructura técnica alcista y ordenada.');
  } else if (technical.trend === 'BEAR' && technical.structure === 'LH_LL') {
    score += defensiveDecision ? 10 : -10;
    reasons.push(defensiveDecision ? 'Deterioro técnico confirma señal defensiva.' : 'Tendencia y estructura bajistas penalizan una entrada.');
  }

  if (marketRegime === 'RISK_ON') {
    score += bullishDecision ? 9 : -2;
    reasons.push('SPY y contexto disponible favorecen régimen risk-on.');
  } else if (marketRegime === 'DEFENSIVE') {
    score += defensiveDecision ? 10 : bullishDecision ? -14 : 2;
    reasons.push(defensiveDecision ? 'Régimen defensivo refuerza reducción/salida.' : 'Régimen defensivo penaliza nuevas compras.');
  } else if (marketRegime === 'MIXED') {
    score -= bullishDecision ? 4 : 0;
    reasons.push('Contexto de mercado mixto: exige mayor selectividad.');
  } else {
    score -= bullishDecision ? 5 : 0;
    reasons.push('Contexto de mercado incompleto; prioridad moderada por prudencia.');
  }

  if (marketContext?.benchmarkTrend === 'BULL') reasons.push(`${marketContext.benchmarkSymbol} en tendencia alcista.`);
  if (marketContext?.benchmarkTrend === 'BEAR') reasons.push(`${marketContext.benchmarkSymbol} en tendencia bajista.`);
  if (marketContext?.sectorTrend === 'BULL') reasons.push(`${marketContext.sectorSymbol ?? 'Sector'} acompaña al alza.`);
  if (marketContext?.sectorTrend === 'BEAR') reasons.push(`${marketContext.sectorSymbol ?? 'Sector'} presenta deterioro.`);

  if (decision === 'TAKE_PROFIT' && scores.conviction >= 70) {
    score -= 4;
    reasons.push('Convicción aún elevada: toma parcial preferible a salida total.');
  }

  if (decision === 'EXIT') {
    score = Math.max(score, 90);
    reasons.push('Salida/revisión de tesis se trata como evento crítico.');
  }

  const normalized = Math.round(clamp(score));
  return {
    score: normalized,
    level: level(normalized, decision),
    marketRegime,
    contextCoverage,
    reasons,
  };
}
