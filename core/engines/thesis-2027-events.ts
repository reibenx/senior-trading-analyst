import type { EarningsEvent, NewsInsight } from '@/core/providers/alpha-vantage-insights';

export type Thesis2027EventStatus = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT';

export interface Thesis2027EventAssessment {
  status: Thesis2027EventStatus;
  adjustment: number;
  coverage: number;
  catalysts: string[];
  risks: string[];
  upcomingEarningsDate?: string;
}

function sentimentScore(label?: string): number | undefined {
  if (!label) return undefined;
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('bullish')) return 1;
  if (normalized.includes('bearish')) return -1;
  if (normalized.includes('neutral')) return 0;
  return undefined;
}

function daysUntil(date: string, now: Date): number | undefined {
  const target = new Date(date + (date.includes('T') ? '' : 'T00:00:00Z'));
  if (Number.isNaN(target.getTime())) return undefined;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function assessThesis2027Events(
  news: NewsInsight[],
  earnings: EarningsEvent[],
  now = new Date(),
): Thesis2027EventAssessment {
  const recentNews = news.filter((item) => {
    if (!item.publishedAt) return true;
    const published = new Date(item.publishedAt);
    if (Number.isNaN(published.getTime())) return false;
    const ageDays = (now.getTime() - published.getTime()) / 86_400_000;
    return ageDays >= 0 && ageDays <= 14;
  });

  const scored = recentNews.flatMap((item) => {
    const score = sentimentScore(item.sentiment);
    const relevance = item.relevance ?? 0.5;
    if (score === undefined || relevance < 0.25) return [];
    return [{ score, relevance, title: item.title }];
  });

  const weightedTotal = scored.reduce((sum, item) => sum + item.score * item.relevance, 0);
  const relevanceTotal = scored.reduce((sum, item) => sum + item.relevance, 0);
  const normalizedSentiment = relevanceTotal > 0 ? weightedTotal / relevanceTotal : undefined;

  const upcoming = earnings
    .map((event) => ({ event, days: daysUntil(event.reportDate, now) }))
    .filter((item): item is { event: EarningsEvent; days: number } => item.days !== undefined && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0];

  const catalysts: string[] = [];
  const risks: string[] = [];

  if (normalizedSentiment !== undefined) {
    if (normalizedSentiment >= 0.35) catalysts.push('Noticias recientes con sesgo positivo y relevancia suficiente.');
    else if (normalizedSentiment <= -0.35) risks.push('Noticias recientes con sesgo negativo y relevancia suficiente.');
    else catalysts.push('Flujo de noticias reciente sin sesgo material.');
  }

  if (upcoming && upcoming.days <= 14) {
    risks.push(`Earnings próximos en ${upcoming.days} días: posible aumento de volatilidad.`);
  } else if (upcoming && upcoming.days <= 30) {
    catalysts.push(`Earnings dentro de ${upcoming.days} días: catalizador cercano a monitorear.`);
  }

  const coverageParts = [
    scored.length > 0 ? 1 : 0,
    upcoming ? 1 : 0,
  ];
  const coverage = Math.round((coverageParts.reduce((a, b) => a + b, 0) / coverageParts.length) * 100);

  if (normalizedSentiment === undefined && !upcoming) {
    return {
      status: 'INSUFFICIENT',
      adjustment: 0,
      coverage,
      catalysts: [],
      risks: ['Sin evidencia reciente suficiente de noticias o calendario de earnings.'],
    };
  }

  let adjustment = 0;
  if (normalizedSentiment !== undefined) {
    if (normalizedSentiment >= 0.55) adjustment += 2;
    else if (normalizedSentiment >= 0.25) adjustment += 1;
    else if (normalizedSentiment <= -0.55) adjustment -= 2;
    else if (normalizedSentiment <= -0.25) adjustment -= 1;
  }

  if (upcoming && upcoming.days <= 7) adjustment -= 1;

  adjustment = Math.max(-2, Math.min(2, adjustment));
  const status: Thesis2027EventStatus = adjustment > 0
    ? 'POSITIVE'
    : adjustment < 0
      ? 'NEGATIVE'
      : 'NEUTRAL';

  return {
    status,
    adjustment,
    coverage,
    catalysts,
    risks,
    upcomingEarningsDate: upcoming?.event.reportDate,
  };
}
