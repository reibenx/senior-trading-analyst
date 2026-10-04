import { NextResponse } from 'next/server';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';

export async function GET() {
  const broker = getBrokerAdapter();

  if (!broker) {
    return NextResponse.json({
      connected: false,
      broker: null,
      positions: [],
      message: 'IOL bridge not configured',
    });
  }

  try {
    const positions = await broker.getPositions();
    return NextResponse.json({
      connected: true,
      broker: broker.id,
      positions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load portfolio';
    return NextResponse.json({ connected: false, broker: broker.id, positions: [], error: message }, { status: 502 });
  }
}
