import { describe, expect, it } from 'vitest';
import { assessThesis2027Events } from '../core/engines/thesis-2027-events';

describe('thesis 2027 event assessment', () => {
  it('marks recent relevant bullish news as positive', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const result = assessThesis2027Events([
      {
        title: 'AI demand accelerates',
        url: 'https://example.com/a',
        publishedAt: '2026-10-08T12:00:00Z',
        sentiment: 'Bullish',
        relevance: 0.8,
      },
      {
        title: 'Strong datacenter orders',
        url: 'https://example.com/b',
        publishedAt: '2026-10-07T12:00:00Z',
        sentiment: 'Somewhat-Bullish',
        relevance: 0.6,
      },
    ], [], now);

    expect(result.status).toBe('POSITIVE');
    expect(result.adjustment).toBeGreaterThan(0);
  });

  it('marks relevant bearish news as negative', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const result = assessThesis2027Events([
      {
        title: 'Demand outlook weakens',
        url: 'https://example.com/a',
        publishedAt: '2026-10-08T12:00:00Z',
        sentiment: 'Bearish',
        relevance: 0.9,
      },
    ], [], now);

    expect(result.status).toBe('NEGATIVE');
    expect(result.adjustment).toBeLessThan(0);
  });

  it('treats imminent earnings as a volatility risk instead of a directional catalyst', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const result = assessThesis2027Events([], [{
      symbol: 'TSM',
      reportDate: '2026-10-13',
    }], now);

    expect(result.upcomingEarningsDate).toBe('2026-10-13');
    expect(result.risks.join(' ')).toContain('Earnings próximos');
    expect(result.adjustment).toBe(-1);
  });

  it('returns insufficient when there is no usable event evidence', () => {
    const result = assessThesis2027Events([], [], new Date('2026-10-09T12:00:00Z'));
    expect(result.status).toBe('INSUFFICIENT');
    expect(result.adjustment).toBe(0);
  });

  it('caps event influence at plus or minus two points', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const positive = assessThesis2027Events(Array.from({ length: 8 }, (_, index) => ({
      title: `Positive ${index}`,
      url: `https://example.com/${index}`,
      publishedAt: '2026-10-08T12:00:00Z',
      sentiment: 'Bullish',
      relevance: 1,
    })), [], now);

    expect(positive.adjustment).toBe(2);
  });
});
