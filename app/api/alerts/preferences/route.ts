import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAlertPreferences, saveAlertPreferences } from '@/core/monitoring/preferences';

const schema = z.object({
  minConviction: z.number().min(0).max(100),
  strategies: z.array(z.enum(['day', 'swing', 'position'])).min(1),
  entryA: z.boolean(),
  entryB: z.boolean(),
  targetHits: z.boolean(),
  stopBreach: z.boolean(),
  decisions: z.object({
    STRONG_ADD: z.boolean(),
    ADD: z.boolean(),
    TAKE_PROFIT: z.boolean(),
    REDUCE: z.boolean(),
    EXIT: z.boolean(),
  }),
});

export async function GET() {
  try {
    const result = await getAlertPreferences();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load alert preferences';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = schema.parse(await request.json());
    const preferences = await saveAlertPreferences(parsed);
    return NextResponse.json({ preferences, persistent: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid alert preferences', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to save alert preferences';
    const status = message.includes('Redis is not configured') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
