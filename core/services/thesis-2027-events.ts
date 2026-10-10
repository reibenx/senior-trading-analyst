import type { PortfolioOpportunity } from '@/core/domain/opportunity';
import type { FundamentalSnapshot } from '@/core/domain/fundamentals';
import { getThesis2027Overlay } from '@/core/engines/thesis-2027';
import { assessThesis2027Events } from '@/core/engines/thesis-2027-events';
import { assessThesis2027StructuredSignals } from '@/core/engines/thesis-2027-structured';
import { getInsightsProvider } from '@/core/providers/alpha-vantage-insights';

export async function enrichOpportunityWithThesis2027Events(
  opportunity: PortfolioOpportunity,
  fundamentals?: FundamentalSnapshot | null,
): Promise<PortfolioOpportunity> {
  const overlay = getThesis2027Overlay(opportunity.symbol);
  if (overlay.themes.includes('OTHER')) return opportunity;

  const provider = getInsightsProvider();
  if (!provider) {
    return {
      ...opportunity,
      thesis2027EventStatus: 'INSUFFICIENT',
      thesis2027EventAdjustment: 0,
      thesis2027EventCoverage: 0,
      thesis2027Catalysts: [],
      thesis2027EventRisks: ['Proveedor de eventos no configurado.'],
    };
  }

  const [news, earnings] = await Promise.all([
    provider.getNews(opportunity.symbol).catch(() => []),
    provider.getEarnings(opportunity.symbol).catch(() => []),
  ]);
  const assessment = assessThesis2027Events(news, earnings);
  const structured = assessThesis2027StructuredSignals(news, fundamentals, opportunity.currentPrice);

  return {
    ...opportunity,
    thesis2027EventStatus: assessment.status,
    thesis2027EventAdjustment: assessment.adjustment,
    thesis2027EventCoverage: assessment.coverage,
    thesis2027Catalysts: assessment.catalysts,
    thesis2027EventRisks: assessment.risks,
    thesis2027UpcomingEarningsDate: assessment.upcomingEarningsDate,
    thesis2027StructuredAdjustment: structured.adjustment,
    thesis2027StructuredCoverage: structured.coverage,
    thesis2027StructuredSignals: structured.signals,
  };
}
