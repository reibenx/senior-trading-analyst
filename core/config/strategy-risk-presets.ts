import type { Strategy } from '@/core/domain/trading';

export interface StrategyRiskPreset {
  riskPercent: number;
  maxPositionPercent: number;
  trailingAtr: number;
  tp1Percent: number;
  tp2Percent: number;
  entryMode: 'A' | 'B';
  stopMode: 'technical';
  label: string;
  description: string;
}

export const STRATEGY_RISK_PRESETS: Record<Strategy, StrategyRiskPreset> = {
  day: {
    riskPercent: 0.5,
    maxPositionPercent: 15,
    trailingAtr: 1.5,
    tp1Percent: 50,
    tp2Percent: 30,
    entryMode: 'A',
    stopMode: 'technical',
    label: 'Day · defensivo',
    description: 'Menor riesgo por operación, exposición acotada y toma de ganancias más rápida.',
  },
  swing: {
    riskPercent: 1,
    maxPositionPercent: 25,
    trailingAtr: 2.5,
    tp1Percent: 25,
    tp2Percent: 25,
    entryMode: 'A',
    stopMode: 'technical',
    label: 'Swing · balanceado',
    description: 'Equilibrio entre riesgo, amplitud del stop y participación del runner.',
  },
  position: {
    riskPercent: 1.25,
    maxPositionPercent: 35,
    trailingAtr: 3.5,
    tp1Percent: 20,
    tp2Percent: 30,
    entryMode: 'B',
    stopMode: 'technical',
    label: 'Position · amplio',
    description: 'Mayor tolerancia estructural, exposición máxima superior y trailing más holgado.',
  },
};

export function getStrategyRiskPreset(strategy: Strategy): StrategyRiskPreset {
  return STRATEGY_RISK_PRESETS[strategy];
}
