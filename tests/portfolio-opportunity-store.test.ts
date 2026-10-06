import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPortfolioFingerprint, portfolioOpportunityTtlSeconds, UpstashPortfolioOpportunityStore } from '@/core/persistence/portfolio-opportunity-store';
import type { PortfolioRankingSnapshot } from '@/core/domain/opportunity';
import type { Position } from '@/core/domain/trading';

const basePositions: Position[] = [
  { symbol: 'NVDA', quantity: 10, marketValue: 1000, currency: 'ARS' },
  { symbol: 'GOOGL', quantity: 5, marketValue: 500, currency: 'ARS' },
];

afterEach(() => vi.restoreAllMocks());

describe('portfolio opportunity cache', () => {
  it('is stable regardless of position order', () => {
    expect(buildPortfolioFingerprint(basePositions)).toBe(
      buildPortfolioFingerprint([...basePositions].reverse()),
    );
  });

  it('changes when portfolio composition changes', () => {
    const changed = basePositions.map((position) =>
      position.symbol === 'NVDA' ? { ...position, quantity: 11 } : position,
    );
    expect(buildPortfolioFingerprint(changed)).not.toBe(buildPortfolioFingerprint(basePositions));
  });

  it('uses strategy-aware cache horizons', () => {
    expect(portfolioOpportunityTtlSeconds('day')).toBe(600);
    expect(portfolioOpportunityTtlSeconds('swing')).toBe(3600);
    expect(portfolioOpportunityTtlSeconds('position')).toBe(21600);
  });

  it('persists and restores the latest transversal ranking snapshot', async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      const op = String(command[0]);
      if (op === 'SET') {
        memory.set(String(command[1]), String(command[2]));
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      if (op === 'GET') {
        return new Response(JSON.stringify({ result: memory.get(String(command[1])) ?? null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    }));

    const cache = new UpstashPortfolioOpportunityStore('https://redis.test', 'token');
    const snapshot: PortfolioRankingSnapshot = {
      generatedAt: '2026-10-05T00:00:00.000Z',
      strategy: 'position',
      portfolioFingerprint: 'abc123',
      items: [
        {
          rank: 1,
          symbol: 'NVDA',
          opportunityScore: 82,
          action: 'AUMENTAR',
          signalPriorityLevel: 'HIGH',
          marketRegime: 'RISK_ON',
          currentWeightPercent: 8.5,
        },
      ],
    };

    await cache.setLatestRanking(snapshot, 3600);
    await expect(cache.getLatestRanking('position', 'abc123')).resolves.toEqual(snapshot);
  });
});
