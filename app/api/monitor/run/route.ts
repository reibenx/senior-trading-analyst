import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MonitoringAgent } from '@/core/monitoring/agent';
import { defaultMonitorRules } from '@/core/monitoring/rules';
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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { plans } = requestSchema.parse(await request.json());
    const providers = getNotificationProviders();
    const agent = new MonitoringAgent(defaultMonitorRules, providers);
    const events = [];

    for (const plan of plans) {
      const planEvents = await agent.evaluate(plan);
      events.push(...planEvents);
    }

    return NextResponse.json({
      processedPlans: plans.length,
      notificationProviders: providers.map((provider) => provider.id),
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
