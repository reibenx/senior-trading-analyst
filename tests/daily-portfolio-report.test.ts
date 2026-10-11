import { describe, expect, it } from 'vitest';
import { buildDailyPortfolioReport } from '../core/services/daily-portfolio-report';

describe('daily portfolio report', () => {
  it('includes technical, fundamental, thesis and material news sections', () => {
    const report = buildDailyPortfolioReport(
      [{
        symbol: 'TSM',
        quantity: 10,
        marketValue: 1000,
        currency: 'USD',
      }],
      [{
        symbol: 'TSM',
        weightPercent: 100,
        ranking: {
          rank: 1,
          movement: 'UNCHANGED',
          source: 'PORTFOLIO',
          symbol: 'TSM',
          strategy: 'position',
          action: 'AUMENTAR',
          opportunityScore: 84,
          adjustedScore: 92,
          currentWeightPercent: 10,
          valuationScore: 70,
          technicalScore: 86,
          conviction: 88,
          eligibleForNewCapital: true,
          dataQuality: 'FULL',
          notes: [],
          thesis2027HistoryTrend: 'STRENGTHENING',
          thesis2027Adjustment: 9,
          marketRegime: 'RISK_ON',
        },
        fundamentals: {
          symbol: 'TSM',
          revenueGrowthYoY: 0.22,
          earningsGrowthYoY: 0.31,
          forwardPE: 20,
          analystTargetPrice: 180,
          asOf: '2026-10-11T00:00:00Z',
        },
        news: [{
          title: 'AI demand accelerates',
          url: 'https://example.com/ai',
          sentiment: 'Bullish',
          relevance: 0.9,
        }],
      }],
      new Date('2026-10-11T12:00:00Z'),
    );

    expect(report).toContain('TÉCNICO / RIESGO');
    expect(report).toContain('FUNDAMENTALES / VALUACIÓN');
    expect(report).toContain('TESIS 2027');
    expect(report).toContain('NOTICIAS MATERIALMENTE RELEVANTES');
    expect(report).toContain('TSM');
  });

  it('filters low relevance news', () => {
    const report = buildDailyPortfolioReport(
      [{ symbol: 'AAA', quantity: 1, marketValue: 100, currency: 'USD' }],
      [{
        symbol: 'AAA',
        weightPercent: 100,
        news: [{
          title: 'Minor mention',
          url: 'https://example.com/minor',
          sentiment: 'Bullish',
          relevance: 0.2,
        }],
      }],
      new Date('2026-10-11T12:00:00Z'),
    );

    expect(report).toContain('sin novedades de alta relevancia');
    expect(report).not.toContain('Minor mention');
  });

  it('keeps report within WhatsApp text payload limit', () => {
    const longTitle = 'Important portfolio news '.repeat(300);
    const report = buildDailyPortfolioReport(
      [{ symbol: 'AAA', quantity: 1, marketValue: 100, currency: 'USD' }],
      [{
        symbol: 'AAA',
        weightPercent: 100,
        news: [{
          title: longTitle,
          url: 'https://example.com/long',
          sentiment: 'Bearish',
          relevance: 1,
        }],
      }],
      new Date('2026-10-11T12:00:00Z'),
    );

    expect(report.length).toBeLessThanOrEqual(3900);
  });
});
