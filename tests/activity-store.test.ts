import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstashActivityStore } from '@/core/persistence/activity-store';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activity store', () => {
  it('appends and trims the list to the configured maximum', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'OK' }), { status: 200 }));

    const store = new UpstashActivityStore('https://redis.example.test', 'token', 50);
    await store.append({
      id: 'evt-1',
      kind: 'ALERT',
      createdAt: '2026-10-04T19:00:00.000Z',
      symbol: 'NVDA',
      title: 'Entry zone',
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody[0]).toBe('LPUSH');
    expect(secondBody).toEqual(['LTRIM', 'senior-trading-analyst:activity', 0, 49]);
  });

  it('ignores corrupt rows when reading history', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      result: [
        JSON.stringify({ id: 'ok', kind: 'ALERT', createdAt: '2026-10-04T19:00:00.000Z', title: 'ok' }),
        '{invalid-json',
      ],
    }), { status: 200 }));

    const store = new UpstashActivityStore('https://redis.example.test', 'token');
    const records = await store.list(10);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('ok');
  });
});
