import { NextResponse } from 'next/server';
import { buildPortfolioFingerprint, getPortfolioOpportunityStore } from '@/core/persistence/portfolio-opportunity-store';
import { getBrokerAdapter } from '@/core/providers/iol-bridge';

export async function GET() {
  try {
    const broker = getBrokerAdapter();
    const store = getPortfolioOpportunityStore();

    if (!broker) {
      return NextResponse.json({ available: false, error: 'IOL bridge is not configured' }, { status: 503 });
    }
    if (!store) {
      return NextResponse.json({ available: false, error: 'Persistent opportunity store is not configured' }, { status: 503 });
    }

    const positions = await broker.getPositions();
    const portfolioFingerprint = buildPortfolioFingerprint(positions);
    const ranking = await store.getTransversalRanking(portfolioFingerprint);

    return NextResponse.json({
      available: Boolean(ranking),
      portfolioFingerprint,
      ranking,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load transversal ranking';
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}
