import type { PortfolioOpportunity, TransversalRankingSnapshot } from '@/core/domain/opportunity';
import type { Position } from '@/core/domain/trading';
import type { FundamentalSnapshot } from '@/core/domain/fundamentals';
import type { NewsInsight } from '@/core/providers/alpha-vantage-insights';

export interface DailyReportAsset {
  symbol: string;
  weightPercent: number;
  ranking?: TransversalRankingSnapshot['items'][number];
  opportunity?: PortfolioOpportunity;
  fundamentals?: FundamentalSnapshot | null;
  news?: NewsInsight[];
}

function pct(value?: number) {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function num(value?: number) {
  return value === undefined ? '—' : value.toFixed(1);
}

function materialNews(items: NewsInsight[] = []) {
  return items
    .filter((item) => (item.relevance ?? 0) >= 0.5)
    .filter((item) => {
      const sentiment = item.sentiment?.toLowerCase() ?? '';
      return sentiment.includes('bullish') || sentiment.includes('bearish');
    })
    .slice(0, 3);
}

export function buildDailyPortfolioReport(
  positions: Position[],
  assets: DailyReportAsset[],
  generatedAt: Date,
) {
  const total = positions.reduce((sum, p) => sum + Math.max(0, p.marketValue ?? 0), 0);
  const top = [...assets].sort((a, b) => b.weightPercent - a.weightPercent).slice(0, 5);
  const strongest = [...assets]
    .filter((item) => item.ranking)
    .sort((a, b) => (b.ranking?.adjustedScore ?? 0) - (a.ranking?.adjustedScore ?? 0))[0];

  const weakening = assets.filter((item) => item.ranking?.thesis2027HistoryTrend === 'WEAKENING');
  const strengthening = assets.filter((item) => item.ranking?.thesis2027HistoryTrend === 'STRENGTHENING');

  const lines: string[] = [
    '📊 SENIOR TRADING ANALYST · REPORTE DIARIO',
    generatedAt.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Catamarca' }),
    '',
    `Cartera: ${positions.filter((p) => p.quantity > 0).length} posiciones · valor reportado ${total > 0 ? total.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : 'N/D'}`,
  ];

  if (strongest?.ranking) {
    lines.push(`🎯 Prioridad actual: ${strongest.symbol} · score ${strongest.ranking.adjustedScore}/100 · ${strongest.ranking.action.replaceAll('_', ' ')}`);
  }

  lines.push('', 'TÉCNICO / RIESGO');
  for (const item of top) {
    const r = item.ranking;
    if (!r) continue;
    lines.push(
      `• ${item.symbol} ${item.weightPercent.toFixed(1)}% cartera · técnico ${r.technicalScore}/100 · convicción ${r.conviction}/100 · ${r.marketRegime ?? 'UNKNOWN'} · ${r.action.replaceAll('_', ' ')}`,
    );
  }

  lines.push('', 'FUNDAMENTALES / VALUACIÓN');
  for (const item of top) {
    const f = item.fundamentals;
    const r = item.ranking;
    if (!f && !r) continue;
    lines.push(
      `• ${item.symbol}: revenue YoY ${pct(f?.revenueGrowthYoY)} · EPS YoY ${pct(f?.earningsGrowthYoY)} · Fwd P/E ${num(f?.forwardPE)} · target ${num(f?.analystTargetPrice)} · valoración ${r?.valuationScore ?? '—'}/100`,
    );
  }

  if (strengthening.length || weakening.length) {
    lines.push('', 'TESIS 2027');
    for (const item of strengthening.slice(0, 3)) {
      lines.push(`🟢 ${item.symbol}: STRENGTHENING · ajuste ${item.ranking?.thesis2027Adjustment ?? '—'}`);
    }
    for (const item of weakening.slice(0, 3)) {
      lines.push(`🔴 ${item.symbol}: WEAKENING · ajuste ${item.ranking?.thesis2027Adjustment ?? '—'}`);
    }
  }

  const news = assets.flatMap((asset) =>
    materialNews(asset.news).map((item) => ({ symbol: asset.symbol, item })),
  ).sort((a, b) => (b.item.relevance ?? 0) - (a.item.relevance ?? 0)).slice(0, 3);

  if (news.length) {
    lines.push('', 'NOTICIAS MATERIALMENTE RELEVANTES');
    for (const { symbol, item } of news) {
      lines.push(`• ${symbol}: ${item.title} · ${item.sentiment ?? 'sin sesgo'} · relevancia ${Math.round((item.relevance ?? 0) * 100)}%`);
    }
  } else {
    lines.push('', 'NOTICIAS: sin novedades de alta relevancia detectadas en la muestra diaria.');
  }

  lines.push('', 'Generado automáticamente. Revisar antes de ejecutar operaciones.');
  return lines.join('\n').slice(0, 3900);
}
