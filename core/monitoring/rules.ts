import type { AlertEvent, Decision, TradePlan } from '@/core/domain/trading';
import type { MonitorRule } from '@/core/monitoring/agent';

function event(
  plan: TradePlan,
  type: string,
  title: string,
  message: string,
  severity: AlertEvent['severity'],
  dedupKey: string,
): AlertEvent {
  return {
    id: `${plan.symbol}:${type}:${Date.now()}`,
    symbol: plan.symbol,
    severity,
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
    metadata: { dedupKey },
  };
}

const actionableDecision: Partial<Record<Decision, {
  label: string;
  severity: AlertEvent['severity'];
  guidance: string;
}>> = {
  STRONG_ADD: {
    label: 'AUMENTAR FUERTE',
    severity: 'OPPORTUNITY',
    guidance: 'La combinación de setup y score favorece sumar posición. Confirmar tamaño y zona de entrada antes de ejecutar.',
  },
  ADD: {
    label: 'AUMENTAR',
    severity: 'OPPORTUNITY',
    guidance: 'El setup favorece una adición táctica. Priorizar Entry A/B y respetar invalidación.',
  },
  TAKE_PROFIT: {
    label: 'TOMAR GANANCIAS',
    severity: 'ACTION',
    guidance: 'Evaluar toma parcial y mantener un remanente con trailing stop si la estructura sigue vigente.',
  },
  REDUCE: {
    label: 'REDUCIR',
    severity: 'ACTION',
    guidance: 'La relación riesgo/convicción se deterioró. Revisar exposición y reducir si la tesis ya no compensa el riesgo.',
  },
  EXIT: {
    label: 'SALIR / REVISAR TESIS',
    severity: 'CRITICAL',
    guidance: 'La señal requiere revisar la tesis de inmediato y considerar salida si la invalidación se confirma.',
  },
};

export const decisionSignalRule: MonitorRule = {
  id: 'decision-signal',
  evaluate(plan) {
    const signal = actionableDecision[plan.decision];
    if (!signal) return null;
    const convictionBucket = Math.floor(plan.scores.conviction / 5) * 5;
    return event(
      plan,
      'DECISION_SIGNAL',
      `${plan.symbol} · ${signal.label}`,
      `Convicción ${plan.scores.conviction}/100 · Precio ${plan.currentPrice.toFixed(2)}. ${signal.guidance}`,
      signal.severity,
      `${plan.symbol}:DECISION_SIGNAL:${plan.decision}:${convictionBucket}`,
    );
  },
};

export const entryZoneRule: MonitorRule = {
  id: 'entry-zone',
  evaluate(plan) {
    const zones = [plan.entryA, plan.entryB].filter((zone): zone is NonNullable<typeof zone> => Boolean(zone));
    const active = zones.find((zone) => plan.currentPrice >= zone.low && plan.currentPrice <= zone.high);
    if (!active) return null;
    return event(
      plan,
      'ENTRY_ZONE',
      `${plan.symbol} entró en zona de entrada`,
      `Precio ${plan.currentPrice.toFixed(2)} dentro de ${active.low.toFixed(2)}–${active.high.toFixed(2)}.`,
      'OPPORTUNITY',
      `${plan.symbol}:ENTRY_ZONE:${active.low.toFixed(4)}:${active.high.toFixed(4)}`,
    );
  },
};

export const stopBreachRule: MonitorRule = {
  id: 'stop-breach',
  evaluate(plan) {
    if (plan.stop === undefined || plan.currentPrice > plan.stop) return null;
    return event(
      plan,
      'STOP_BREACH',
      `${plan.symbol} perdió el stop técnico`,
      `Precio ${plan.currentPrice.toFixed(2)} <= stop ${plan.stop.toFixed(2)}. Revisar la tesis.`,
      'CRITICAL',
      `${plan.symbol}:STOP_BREACH:${plan.stop.toFixed(4)}`,
    );
  },
};

export const targetHitRule: MonitorRule = {
  id: 'target-hit',
  evaluate(plan) {
    if (!plan.targets.length) return null;
    const reachedIndex = plan.targets.reduce((last, target, index) => plan.currentPrice >= target ? index : last, -1);
    if (reachedIndex < 0) return null;
    const target = plan.targets[reachedIndex];
    return event(
      plan,
      'TARGET_HIT',
      `${plan.symbol} alcanzó TP${reachedIndex + 1}`,
      `Precio ${plan.currentPrice.toFixed(2)} >= target ${target.toFixed(2)}. Evaluar toma parcial o trailing stop.`,
      'ACTION',
      `${plan.symbol}:TARGET_HIT:${reachedIndex + 1}:${target.toFixed(4)}`,
    );
  },
};

export const defaultMonitorRules: MonitorRule[] = [
  stopBreachRule,
  targetHitRule,
  entryZoneRule,
  decisionSignalRule,
];
