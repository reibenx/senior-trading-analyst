import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MonitoringAgent } from '@/core/monitoring/agent';
import { defaultMonitorRules } from '@/core/monitoring/rules';
import { getAlertStateStore } from '@/core/monitoring/state-store';
import { getAlertPreferences, shouldNotifyAlert } from '@/core/monitoring/preferences';
import { getNotificationProviders } from '@/core/providers/notifications';

const zoneSchema = z.object({ low: z.number(), high: z.number() });
const scoreSchema = z.object({
  technical: z.number(),
  fundamental: z.number(),
  valuation: z.number(),
  market: z.number(),
  riskReward: z.number(),
  portfolioFit: z.number(),
  conviction: z.number(),
});

const riskProfileSchema = z.object({
  label: z.string(),
  riskPercent: z.number(),
  maxPositionPercent: z.number(),
  trailingAtr: z.number(),
  tp1Percent: z.number(),
  tp2Percent: z.number(),
  runnerPercent: z.number(),
  preferredEntry: z.enum(['A', 'B']),
});

const signalPrioritySchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  marketRegime: z.enum(['RISK_ON', 'MIXED', 'DEFENSIVE', 'UNKNOWN']),
  contextCoverage: z.enum(['FULL', 'BENCHMARK_ONLY', 'NONE']),
  reasons: z.array(z.string()),
});

const planSchema = z.object({
  symbol: z.string().min(1).max(20),
  strategy: z.enum(['day', 'swing', 'position']),
  decision: z.enum(['STRONG_ADD', 'ADD', 'HOLD', 'TAKE_PROFIT', 'REDUCE', 'EXIT']),
  scores: scoreSchema,
  currentPrice: z.number().positive(),
  entryA: zoneSchema.optional(),
  entryB: zoneSchema.optional(),
  exceptionalEntry: zoneSchema.optional(),
  invalidation: z.number().optional(),
  stop: z.number().optional(),
  targets: z.array(z.number()),
  riskReward: z.number().optional(),
  positionSize: z.number().optional(),
  riskProfile: riskProfileSchema.optional(),
  signalPriority: signalPrioritySchema.optional(),
  thesis: z.array(z.string()),
  risks: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  generatedAt: z.string(),
});

const requestSchema = z.object({ plans: z.array(planSchema).min(1).max(100) });

function authorized(request: Request): boolean {
  const expected = process.env.MONITOR_CRON_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${expected}`;
}

function alertTtlSeconds(): number {
  const configured = Number(process.env.ALERT_DEDUP_TTL_SECONDS ?? 86400);
  return Number.isFinite(configured) ? Math.max(300, Math.min(604800, Math.floor(configured))) : 86400;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { plans } = requestSchema.parse(await request.json());
    const providers = getNotificationProviders();
    const stateStore = getAlertStateStore();
    const { preferences: alertPreferences, persistent: persistentAlertPreferences } = await getAlertPreferences().catch(() => ({ preferences: undefined, persistent: false }));
    const agent = new MonitoringAgent(defaultMonitorRules, providers, stateStore, alertTtlSeconds(), alertPreferences ? ((plan, event) => shouldNotifyAlert(plan, event, alertPreferences)) : undefined);
    const events = [];

    for (const plan of plans) {
      const planEvents = await agent.evaluate(plan);
      events.push(...planEvents);
    }

    return NextResponse.json({
      processedPlans: plans.length,
      notificationProviders: providers.map((provider) => provider.id),
      persistentDeduplication: Boolean(stateStore),
      persistentAlertPreferences,
      alertPreferences,
      events,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid monitoring payload', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Unable to execute monitoring agent';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
