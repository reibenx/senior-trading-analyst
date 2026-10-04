import type { AlertEvent, TradePlan } from '@/core/domain/trading';
import type { MonitorRule } from '@/core/monitoring/agent';

function event(plan: TradePlan, type: string, title: string, message: string, severity: AlertEvent['severity']): AlertEvent {
  return {
    id: `${plan.symbol}:${type}:${Date.now()}`,
    symbol: plan.symbol,
    severity,
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
  };
}

export const entryZoneRule: MonitorRule = {
  id: 'entry-zone',
  evaluate(plan) {
    const zones = [plan.entryA, plan.entryB].filter((zone): zone is NonNullable<typeof zone> => Boolean(zone));
    const active = zones.find((zone) => plan.currentPrice >= zone.low && plan.currentPrice <= zone.high);
    if (!active) return null;
    return event(plan, 'ENTRY_ZONE', `${plan.symbol} entró en zona de entrada`, `Precio ${plan.currentPrice.toFixed(2)} dentro de ${active.low.toFixed(2)}–${active.high.toFixed(2)}.`, 'OPPORTUNITY');
  },
};

export const stopBreachRule: MonitorRule = {
  id: 'stop-breach',
  evaluate(plan) {
    if (plan.stop === undefined || plan.currentPrice > plan.stop) return null;
    return event(plan, 'STOP_BREACH', `${plan.symbol} perdió el stop técnico`, `Precio ${plan.currentPrice.toFixed(2)} <= stop ${plan.stop.toFixed(2)}. Revisar la tesis.`, 'CRITICAL');
  },
};

export const targetHitRule: MonitorRule = {
  id: 'target-hit',
  evaluate(plan) {
    if (!plan.targets.length) return null;
    const reachedIndex = plan.targets.reduce((last, target, index) => plan.currentPrice >= target ? index : last, -1);
    if (reachedIndex < 0) return null;
    const target = plan.targets[reachedIndex];
    return event(plan, 'TARGET_HIT', `${plan.symbol} alcanzó TP${reachedIndex + 1}`, `Precio ${plan.currentPrice.toFixed(2)} >= target ${target.toFixed(2)}. Evaluar toma parcial o trailing stop.`, 'ACTION');
  },
};

export const defaultMonitorRules: MonitorRule[] = [stopBreachRule, targetHitRule, entryZoneRule];
