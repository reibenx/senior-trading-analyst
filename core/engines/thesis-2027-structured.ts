import type { FundamentalSnapshot } from '@/core/domain/fundamentals';
import type { NewsInsight } from '@/core/providers/alpha-vantage-insights';

export type Thesis2027StructuredCategory =
  | 'GUIDANCE'
  | 'ANALYST_REVISION'
  | 'PRICE_TARGET'
  | 'CAPEX_AI';

export interface Thesis2027StructuredSignal {
  category: Thesis2027StructuredCategory;
  direction: -1 | 1;
  evidence: string;
}

export interface Thesis2027StructuredAssessment {
  adjustment: number;
  coverage: number;
  signals: Thesis2027StructuredSignal[];
}

function textOf(item: NewsInsight) {
  return `${item.title} ${item.summary ?? ''}`.toLowerCase();
}

function firstMatch(
  news: NewsInsight[],
  positive: RegExp,
  negative: RegExp,
  category: Thesis2027StructuredCategory,
): Thesis2027StructuredSignal | null {
  for (const item of news) {
    const text = textOf(item);
    if (positive.test(text)) {
      return { category, direction: 1, evidence: item.title };
    }
    if (negative.test(text)) {
      return { category, direction: -1, evidence: item.title };
    }
  }
  return null;
}

export function assessThesis2027StructuredSignals(
  news: NewsInsight[],
  fundamentals: FundamentalSnapshot | null | undefined,
  currentPrice: number,
): Thesis2027StructuredAssessment {
  const signals: Thesis2027StructuredSignal[] = [];

  const guidance = firstMatch(
    news,
    /\b(raise[sd]?|boost(?:s|ed)?|increase[sd]?|lift(?:s|ed)?)\b.{0,35}\b(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast)\b.{0,35}\b(raise[sd]?|boost(?:s|ed)?|increase[sd]?|lift(?:s|ed)?)\b/i,
    /\b(cut(?:s)?|lower(?:s|ed)?|reduce[sd]?|trim(?:s|med)?)\b.{0,35}\b(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast)\b.{0,35}\b(cut(?:s)?|lower(?:s|ed)?|reduce[sd]?|trim(?:s|med)?)\b/i,
    'GUIDANCE',
  );
  if (guidance) signals.push(guidance);

  const analyst = firstMatch(
    news,
    /\b(upgrade[sd]?|raised? rating|initiates? (?:at|with) (?:buy|outperform|overweight))\b/i,
    /\b(downgrade[sd]?|lowered? rating|initiates? (?:at|with) (?:sell|underperform|underweight))\b/i,
    'ANALYST_REVISION',
  );
  if (analyst) signals.push(analyst);

  const capex = firstMatch(
    news,
    /\b(boost(?:s|ed)?|expand(?:s|ed)?|increase[sd]?|accelerat(?:e|es|ed|ing))\b.{0,60}\b(capex|capital spending|ai infrastructure|data cent(?:er|re)|gpu demand|ai demand)\b|\b(ai demand|gpu demand)\b.{0,40}\b(strong|surge[sd]?|accelerat(?:e|es|ed|ing))\b/i,
    /\b(cut(?:s)?|reduce[sd]?|slow(?:s|ed|ing)?|delay(?:s|ed)?|weaken(?:s|ed|ing)?)\b.{0,60}\b(capex|capital spending|ai infrastructure|data cent(?:er|re)|gpu demand|ai demand)\b|\b(ai demand|gpu demand)\b.{0,40}\b(weak|slow(?:s|ed|ing)?|declin(?:e|es|ed|ing))\b/i,
    'CAPEX_AI',
  );
  if (capex) signals.push(capex);

  if (
    fundamentals?.analystTargetPrice !== undefined
    && Number.isFinite(fundamentals.analystTargetPrice)
    && fundamentals.analystTargetPrice > 0
    && currentPrice > 0
  ) {
    const upside = ((fundamentals.analystTargetPrice - currentPrice) / currentPrice) * 100;
    if (upside >= 20) {
      signals.push({
        category: 'PRICE_TARGET',
        direction: 1,
        evidence: `Precio objetivo de consenso implica ${Math.round(upside)}% de upside.`,
      });
    } else if (upside <= -10) {
      signals.push({
        category: 'PRICE_TARGET',
        direction: -1,
        evidence: `Precio objetivo de consenso implica ${Math.round(upside)}% de downside.`,
      });
    }
  }

  const unique = new Map<Thesis2027StructuredCategory, Thesis2027StructuredSignal>();
  for (const signal of signals) {
    if (!unique.has(signal.category)) unique.set(signal.category, signal);
  }
  const resolved = [...unique.values()];
  const rawAdjustment = resolved.reduce((sum, signal) => sum + signal.direction, 0);
  const adjustment = Math.max(-3, Math.min(3, rawAdjustment));
  const coverage = Math.round((resolved.length / 4) * 100);

  return { adjustment, coverage, signals: resolved };
}
