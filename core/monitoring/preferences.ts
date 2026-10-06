import type { AlertEvent, Decision, Strategy, TradePlan } from '@/core/domain/trading';
import { getRedisRestConfig } from '@/core/persistence/redis-env';

export type AlertPriorityThreshold = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertPreferences {
  minConviction: number;
  minPriority: AlertPriorityThreshold;
  strategies: Strategy[];
  entryA: boolean;
  entryB: boolean;
  targetHits: boolean;
  stopBreach: boolean;
  decisions: Record<Exclude<Decision, 'HOLD'>, boolean>;
}

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  minConviction: 60,
  minPriority: 'MEDIUM',
  strategies: ['day', 'swing', 'position'],
  entryA: true,
  entryB: true,
  targetHits: true,
  stopBreach: true,
  decisions: {
    STRONG_ADD: true,
    ADD: true,
    TAKE_PROFIT: true,
    REDUCE: true,
    EXIT: true,
  },
};

const KEY = 'senior-trading-analyst:monitor:preferences';

function normalizePreferences(value: Partial<AlertPreferences> | null | undefined): AlertPreferences {
  const minConviction = Number(value?.minConviction);
  const strategies = Array.isArray(value?.strategies)
    ? value!.strategies.filter((item): item is Strategy => item === 'day' || item === 'swing' || item === 'position')
    : DEFAULT_ALERT_PREFERENCES.strategies;

  const minPriority = value?.minPriority;
  const normalizedPriority: AlertPriorityThreshold =
    minPriority === 'LOW' || minPriority === 'MEDIUM' || minPriority === 'HIGH' || minPriority === 'CRITICAL'
      ? minPriority
      : DEFAULT_ALERT_PREFERENCES.minPriority;

  return {
    minConviction: Number.isFinite(minConviction) ? Math.max(0, Math.min(100, Math.round(minConviction))) : DEFAULT_ALERT_PREFERENCES.minConviction,
    minPriority: normalizedPriority,
    strategies: strategies.length ? [...new Set(strategies)] : DEFAULT_ALERT_PREFERENCES.strategies,
    entryA: value?.entryA ?? DEFAULT_ALERT_PREFERENCES.entryA,
    entryB: value?.entryB ?? DEFAULT_ALERT_PREFERENCES.entryB,
    targetHits: value?.targetHits ?? DEFAULT_ALERT_PREFERENCES.targetHits,
    stopBreach: value?.stopBreach ?? DEFAULT_ALERT_PREFERENCES.stopBreach,
    decisions: {
      STRONG_ADD: value?.decisions?.STRONG_ADD ?? DEFAULT_ALERT_PREFERENCES.decisions.STRONG_ADD,
      ADD: value?.decisions?.ADD ?? DEFAULT_ALERT_PREFERENCES.decisions.ADD,
      TAKE_PROFIT: value?.decisions?.TAKE_PROFIT ?? DEFAULT_ALERT_PREFERENCES.decisions.TAKE_PROFIT,
      REDUCE: value?.decisions?.REDUCE ?? DEFAULT_ALERT_PREFERENCES.decisions.REDUCE,
      EXIT: value?.decisions?.EXIT ?? DEFAULT_ALERT_PREFERENCES.decisions.EXIT,
    },
  };
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  const redis = getRedisRestConfig();
  if (!redis) throw new Error('Redis is not configured');
  const response = await fetch(redis.restUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redis.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Alert preferences store error: HTTP ${response.status}`);
  const payload = await response.json() as { result: T };
  return payload.result;
}

export async function getAlertPreferences(): Promise<{ preferences: AlertPreferences; persistent: boolean }> {
  if (!getRedisRestConfig()) return { preferences: DEFAULT_ALERT_PREFERENCES, persistent: false };
  const raw = await redisCommand<string | null>(['GET', KEY]);
  if (!raw) return { preferences: DEFAULT_ALERT_PREFERENCES, persistent: true };
  try {
    return { preferences: normalizePreferences(JSON.parse(raw) as Partial<AlertPreferences>), persistent: true };
  } catch {
    return { preferences: DEFAULT_ALERT_PREFERENCES, persistent: true };
  }
}

export async function saveAlertPreferences(value: Partial<AlertPreferences>): Promise<AlertPreferences> {
  const preferences = normalizePreferences(value);
  await redisCommand(['SET', KEY, JSON.stringify(preferences)]);
  return preferences;
}

const PRIORITY_RANK: Record<AlertPriorityThreshold, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function priorityPasses(plan: TradePlan, threshold: AlertPriorityThreshold): boolean {
  const level = plan.signalPriority?.level ?? 'LOW';
  return PRIORITY_RANK[level] >= PRIORITY_RANK[threshold];
}

function priceInside(price: number, zone: TradePlan['entryA'] | TradePlan['entryB']): boolean {
  return Boolean(zone && price >= zone.low && price <= zone.high);
}

export function shouldNotifyAlert(plan: TradePlan, event: AlertEvent, preferences: AlertPreferences): boolean {
  if (!preferences.strategies.includes(plan.strategy)) return false;

  if (event.type === 'STOP_BREACH') return preferences.stopBreach;
  if (event.type === 'TARGET_HIT') return preferences.targetHits;

  if (event.type === 'ENTRY_ZONE') {
    if (plan.scores.conviction < preferences.minConviction) return false;
    if (!priorityPasses(plan, preferences.minPriority)) return false;
    const inA = priceInside(plan.currentPrice, plan.entryA);
    const inB = priceInside(plan.currentPrice, plan.entryB);
    return (inA && preferences.entryA) || (inB && preferences.entryB);
  }

  if (event.type === 'DECISION_SIGNAL') {
    if (plan.scores.conviction < preferences.minConviction) return false;
    if (!priorityPasses(plan, preferences.minPriority)) return false;
    if (plan.decision === 'HOLD') return false;
    return preferences.decisions[plan.decision];
  }

  return true;
}
