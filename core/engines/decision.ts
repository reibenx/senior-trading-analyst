import type { TechnicalSnapshot } from '@/core/domain/market';
import type { Decision, ScoreCard, Strategy } from '@/core/domain/trading';

export interface DecisionContext {
  strategy: Strategy;
  scores: ScoreCard;
  technical: TechnicalSnapshot;
  alreadyOwned: boolean;
}

export interface DecisionResult {
  decision: Decision;
  headline: string;
  reasons: string[];
  warnings: string[];
}

export function decide(context: DecisionContext): DecisionResult {
  const { scores, technical, alreadyOwned } = context;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (technical.trend === 'BULL') reasons.push('La tendencia primaria es alcista.');
  if (technical.structure === 'HH_HL') reasons.push('La estructura mantiene máximos y mínimos crecientes.');
  if (scores.fundamental >= 75) reasons.push('La calidad fundamental acompaña la tesis.');
  if (scores.riskReward >= 70) reasons.push('La relación riesgo/retorno es favorable.');
  if (technical.rsi14 && technical.rsi14 > 72) warnings.push('Momentum extendido: evitar perseguir precio.');
  if (scores.valuation < 50) warnings.push('La valuación reduce el margen de seguridad.');
  if (scores.portfolioFit < 50) warnings.push('La posición puede incrementar concentración o correlación de cartera.');
  if (technical.trend === 'BEAR') warnings.push('La tendencia primaria es bajista.');

  if (scores.conviction >= 86 && technical.trend === 'BULL' && scores.portfolioFit >= 65) {
    return { decision: alreadyOwned ? 'STRONG_ADD' : 'ADD', headline: alreadyOwned ? 'AUMENTAR FUERTE' : 'ENTRAR', reasons, warnings };
  }
  if (scores.conviction >= 76 && technical.trend !== 'BEAR') {
    return { decision: alreadyOwned ? 'ADD' : 'ADD', headline: alreadyOwned ? 'AUMENTAR EN PULLBACK' : 'ENTRAR EN ZONA', reasons, warnings };
  }
  if (scores.conviction >= 62 && technical.trend !== 'BEAR') {
    return { decision: 'HOLD', headline: alreadyOwned ? 'MANTENER' : 'ESPERAR MEJOR ENTRADA', reasons, warnings };
  }
  if (alreadyOwned && (scores.conviction < 48 || technical.trend === 'BEAR')) {
    return { decision: 'REDUCE', headline: 'REDUCIR / REVISAR TESIS', reasons, warnings };
  }

  return { decision: alreadyOwned ? 'HOLD' : 'HOLD', headline: alreadyOwned ? 'MANTENER CON CAUTELA' : 'ESPERAR', reasons, warnings };
}
