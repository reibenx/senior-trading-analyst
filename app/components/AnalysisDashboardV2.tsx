'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { TechnicalChart } from '@/app/components/TechnicalChart';
import type { FundamentalScore, FundamentalSnapshot } from '@/core/domain/fundamentals';
import type { MarketContextSnapshot } from '@/core/domain/market-context';
import type { LineOverlay, OHLCVBar, TechnicalSnapshot, Timeframe, ZoneOverlay } from '@/core/domain/market';
import type { Position, Strategy } from '@/core/domain/trading';
import type { EarningsEvent, NewsInsight } from '@/core/providers/alpha-vantage-insights';
import { decide } from '@/core/engines/decision';
import { calculatePortfolioFit } from '@/core/engines/portfolio-fit';
import { calculatePositionSizing } from '@/core/engines/risk';
import { calculateScores } from '@/core/engines/scoring';
import { calculateTechnicalScore } from '@/core/engines/technical-score';

interface Props { initialBars: OHLCVBar[]; initialSnapshot: TechnicalSnapshot }
interface AnalyzeResponse {
  source: string; bars: OHLCVBar[]; snapshot: TechnicalSnapshot;
  fundamentals?: FundamentalSnapshot | null; fundamentalScore?: FundamentalScore | null;
  fundamentalSource?: string | null; marketContext?: MarketContextSnapshot | null; error?: string;
}
interface TechnicalResponse { source?: string; bars?: OHLCVBar[]; snapshot?: TechnicalSnapshot; error?: string }
interface PortfolioResponse { connected: boolean; broker: string | null; positions: Position[]; error?: string }
interface NewsResponse { items?: NewsInsight[]; error?: string; source?: string }
interface EventsResponse { items?: EarningsEvent[]; error?: string; source?: string }
type AnalysisTab = 'summary' | 'technical' | 'fundamental' | 'risk' | 'news';
type ResearchTab = 'summary' | 'fundamental' | 'valuation' | 'expectations' | 'sector' | 'risks';
type ChartRange = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1A' | '5A' | 'Todos';
type QuickTab = 'portfolio' | 'watchlist';
type ChartToolPanel = 'drawings' | 'compare' | null;
type EntryMode = 'A' | 'B' | 'custom';
type StopMode = 'technical' | 'manual';

const STRATEGY_TIMEFRAMES: Record<Strategy, Timeframe[]> = {
  day: ['1m', '5m', '15m', '1h'], swing: ['1h', '4h', '1d', '1w'], position: ['1d', '1w', '1M'],
};
const STRATEGY_LABELS: Record<Strategy, { title: string; subtitle: string; icon: string }> = {
  day: { title: 'Day Trading', subtitle: '1m / 5m / 15m', icon: '⌁' },
  swing: { title: 'Swing Trading', subtitle: '1h / 4h / D', icon: '↗' },
  position: { title: 'Position Trading', subtitle: 'D / W / M', icon: '⌁' },
};
const TABS: Array<[AnalysisTab, string]> = [
  ['summary', 'Resumen'], ['technical', 'Técnico'], ['fundamental', 'Fundamental'], ['risk', 'Riesgo'], ['news', 'Noticias'],
];
const RESEARCH_TABS: Array<[ResearchTab, string]> = [
  ['summary', 'Resumen'], ['fundamental', 'Fundamental'], ['valuation', 'Valuación'], ['expectations', 'Expectativas'], ['sector', 'Sector'], ['risks', 'Riesgos'],
];
const CHART_RANGES: ChartRange[] = ['1D','5D','1M','3M','6M','YTD','1A','5A','Todos'];

function getLineValue(snapshot: TechnicalSnapshot, id: string) {
  const overlay = snapshot.overlays.find((item): item is LineOverlay & { value: number } => item.id === id && item.kind !== 'entry-zone' && typeof item.value === 'number');
  return overlay?.value;
}
function getZoneValue(snapshot: TechnicalSnapshot, id: string) {
  return snapshot.overlays.find((item): item is ZoneOverlay => item.id === id && item.kind === 'entry-zone');
}
function fmtRatio(value?: number) { return value === undefined ? '—' : value.toFixed(2); }
function fmtPct(value?: number) { return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`; }
function fmtMoney(value?: number, currency = 'USD') {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}
function fmtCompact(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
function trendLabel(trend?: 'BULL' | 'NEUTRAL' | 'BEAR') { return trend === 'BULL' ? 'Alcista' : trend === 'BEAR' ? 'Bajista' : 'Neutral'; }
function zoneText(zone?: ZoneOverlay) { return zone ? `${zone.low.toFixed(2)} – ${zone.high.toFixed(2)}` : '—'; }
function rrText(value?: number) { return value === undefined ? '—' : `1 : ${value.toFixed(1)}`; }
function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date);
}
function rangeStart(range: ChartRange, latest: Date) {
  const d = new Date(latest);
  if (range === '1D') d.setDate(d.getDate() - 1);
  else if (range === '5D') d.setDate(d.getDate() - 5);
  else if (range === '1M') d.setMonth(d.getMonth() - 1);
  else if (range === '3M') d.setMonth(d.getMonth() - 3);
  else if (range === '6M') d.setMonth(d.getMonth() - 6);
  else if (range === 'YTD') return new Date(latest.getFullYear(), 0, 1);
  else if (range === '1A') d.setFullYear(d.getFullYear() - 1);
  else if (range === '5A') d.setFullYear(d.getFullYear() - 5);
  return d;
}
function selectRange(bars: OHLCVBar[], range: ChartRange) {
  if (range === 'Todos' || bars.length < 2) return bars;
  const latest = new Date(bars.at(-1)?.time ?? Date.now());
  const start = rangeStart(range, latest).getTime();
  const filtered = bars.filter((bar) => new Date(bar.time).getTime() >= start);
  return filtered.length ? filtered : bars.slice(-1);
}
function metric(label: string, value: string) { return <div className="researchMetric"><span>{label}</span><b>{value}</b></div>; }

function FundamentalPanel({ fundamentals, score, source }: { fundamentals: FundamentalSnapshot | null; score: FundamentalScore | null; source: string | null }) {
  if (!fundamentals) return <div className="fundamentalDetailPanel"><p className="mutedText">No hay datos fundamentales disponibles para este ticker.</p></div>;
  const currency = fundamentals.currency ?? 'USD';
  const rows = [
    ['Capitalización', fmtCompact(fundamentals.marketCapitalization)], ['P/E (ttm)', fmtRatio(fundamentals.trailingPE)],
    ['Forward P/E', fmtRatio(fundamentals.forwardPE)], ['PEG', fmtRatio(fundamentals.pegRatio)],
    ['Precio / Ventas', fmtRatio(fundamentals.priceToSales)], ['Precio / Libro', fmtRatio(fundamentals.priceToBook)],
    ['EV / EBITDA', fmtRatio(fundamentals.evToEbitda)], ['Margen neto', fmtPct(fundamentals.profitMargin)],
    ['Margen operativo', fmtPct(fundamentals.operatingMargin)], ['ROE', fmtPct(fundamentals.returnOnEquity)],
    ['ROA', fmtPct(fundamentals.returnOnAssets)], ['Crec. ingresos YoY', fmtPct(fundamentals.revenueGrowthYoY)],
    ['Crec. ganancias YoY', fmtPct(fundamentals.earningsGrowthYoY)], ['Beta', fmtRatio(fundamentals.beta)],
    ['Target analistas', fmtMoney(fundamentals.analystTargetPrice, currency)], ['Máximo 52 semanas', fmtMoney(fundamentals.week52High, currency)],
    ['Mínimo 52 semanas', fmtMoney(fundamentals.week52Low, currency)],
  ];
  return <div className="fundamentalDetailPanel">
    <div className="fundamentalDetailHead"><div><h3>{fundamentals.name ?? fundamentals.symbol}</h3><span>{fundamentals.sector ?? 'Sector no informado'} · {fundamentals.industry ?? 'Industria no informada'}</span></div><div className="fundamentalTotal"><b>{score?.total ?? '—'}</b><small>/100</small></div></div>
    <div className="fundamentalScoreMini"><span>Calidad <b>{score?.quality ?? '—'}</b></span><span>Crecimiento <b>{score?.growth ?? '—'}</b></span><span>Valuación <b>{score?.valuation ?? '—'}</b></span></div>
    <div className="fundamentalMetrics">{rows.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <div className="fundamentalMeta"><span>Fuente: {source ?? 'proveedor fundamental'}</span><span>Actualizado: {dateLabel(fundamentals.asOf)}</span></div>
  </div>;
}

export function AnalysisDashboardV2({ initialBars, initialSnapshot }: Props) {
  const [symbol, setSymbol] = useState(initialSnapshot.symbol);
  const [topSearch, setTopSearch] = useState(initialSnapshot.symbol);
  const [strategy, setStrategy] = useState<Strategy>('swing');
  const [timeframe, setTimeframe] = useState<Timeframe>(initialSnapshot.timeframe);
  const [chartRange, setChartRange] = useState<ChartRange>('Todos');
  const [researchTab, setResearchTab] = useState<ResearchTab>('summary');
  const [quickTab, setQuickTab] = useState<QuickTab>('portfolio');
  const [chartToolPanel, setChartToolPanel] = useState<ChartToolPanel>(null);
  const [manualLevelInput, setManualLevelInput] = useState('');
  const [manualLevels, setManualLevels] = useState<number[]>([]);
  const [compareInput, setCompareInput] = useState('SPY');
  const [comparisonSymbol, setComparisonSymbol] = useState<string | null>(null);
  const [comparisonBars, setComparisonBars] = useState<OHLCVBar[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [capital, setCapital] = useState('5000');
  const [risk, setRisk] = useState('1.0');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('A');
  const [customEntry, setCustomEntry] = useState('');
  const [stopMode, setStopMode] = useState<StopMode>('technical');
  const [manualStop, setManualStop] = useState('');
  const [maxPositionPercent, setMaxPositionPercent] = useState('25');
  const [trailingAtr, setTrailingAtr] = useState('2.5');
  const [tp1Percent, setTp1Percent] = useState('25');
  const [tp2Percent, setTp2Percent] = useState('25');
  const [bars, setBars] = useState(initialBars);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [source, setSource] = useState('demo-fixture');
  const [fundamentals, setFundamentals] = useState<FundamentalSnapshot | null>(null);
  const [fundamentalScore, setFundamentalScore] = useState<FundamentalScore | null>(null);
  const [fundamentalSource, setFundamentalSource] = useState<string | null>(null);
  const [marketContext, setMarketContext] = useState<MarketContextSnapshot | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  const [portfolioBroker, setPortfolioBroker] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('summary');
  const [news, setNews] = useState<NewsInsight[] | null>(null);
  const [events, setEvents] = useState<EarningsEvent[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState<'news' | 'events' | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleBars = useMemo(() => selectRange(bars, chartRange), [bars, chartRange]);
  const technicalScore = useMemo(() => calculateTechnicalScore(snapshot), [snapshot]);
  const entryA = getZoneValue(snapshot, 'entry-a');
  const entryB = getZoneValue(snapshot, 'entry-b');
  const stop = getLineValue(snapshot, 'stop');
  const tp1 = getLineValue(snapshot, 'tp1');
  const tp2 = getLineValue(snapshot, 'tp2');
  const currentPrice = bars.at(-1)?.close ?? 0;
  const effectiveEntry = useMemo(() => {
    if (entryMode === 'A') return entryA?.high;
    if (entryMode === 'B') return entryB?.high;
    const value = Number(customEntry.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }, [entryMode, entryA, entryB, customEntry]);
  const effectiveStop = useMemo(() => {
    if (stopMode === 'technical') return stop;
    const value = Number(manualStop.replace(',', '.'));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }, [stopMode, stop, manualStop]);
  const exitPlan = useMemo(() => {
    const first = Math.max(0, Math.min(100, Number(tp1Percent.replace(',', '.')) || 0));
    const second = Math.max(0, Math.min(100, Number(tp2Percent.replace(',', '.')) || 0));
    const runner = Math.max(0, 100 - first - second);
    const trailing = Math.max(0, Number(trailingAtr.replace(',', '.')) || 0);
    return { tp1: first, tp2: second, runner, trailing };
  }, [tp1Percent, tp2Percent, trailingAtr]);
  const exitPlanValid = exitPlan.tp1 + exitPlan.tp2 <= 100 && exitPlan.trailing > 0;
  const riskPlan = useMemo(() => {
    const c = Number(capital.replace(',', '.'));
    const r = Number(risk.replace(',', '.'));
    const maxAllocation = Number(maxPositionPercent.replace(',', '.'));
    if (effectiveEntry === undefined || effectiveStop === undefined) return null;
    return calculatePositionSizing({
      capital: c,
      riskPercent: r,
      entryPrice: effectiveEntry,
      stopPrice: effectiveStop,
      targetPrice: tp2 ?? tp1,
      maxPositionPercent: Number.isFinite(maxAllocation) ? maxAllocation : undefined,
    });
  }, [capital, risk, effectiveEntry, effectiveStop, tp1, tp2, maxPositionPercent]);
  const riskRewardScore = riskPlan?.riskReward === undefined ? 0 : Math.round(Math.max(0, Math.min(100, riskPlan.riskReward * 25)));
  const portfolioFit = useMemo(() => portfolioConnected && positions.length ? calculatePortfolioFit(positions, snapshot.symbol, 0) : null, [portfolioConnected, positions, snapshot.symbol]);
  const activePosition = useMemo(() => positions.find((p) => p.symbol.toUpperCase() === snapshot.symbol.toUpperCase() && p.quantity > 0), [positions, snapshot.symbol]);
  const totalPortfolioValue = useMemo(() => positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0), [positions]);
  const positionUnitPrice = activePosition?.marketValue && activePosition.quantity > 0 ? activePosition.marketValue / activePosition.quantity : undefined;
  const positionPnlPercent = activePosition?.averagePrice && positionUnitPrice ? ((positionUnitPrice / activePosition.averagePrice) - 1) * 100 : undefined;
  const scoreCard = useMemo(() => calculateScores(strategy, {
    technical: technicalScore, fundamental: fundamentalScore?.total ?? 50, valuation: fundamentalScore?.valuation ?? 50,
    market: marketContext?.score ?? 50, riskReward: riskRewardScore, portfolioFit: portfolioFit?.portfolioFitScore ?? 50,
  }), [strategy, technicalScore, fundamentalScore, marketContext, riskRewardScore, portfolioFit]);
  const decisionResult = useMemo(() => decide({ strategy, scores: scoreCard, technical: snapshot, alreadyOwned: Boolean(activePosition) }), [strategy, scoreCard, snapshot, activePosition]);
  const decisionSecondary = decisionResult.headline === 'MANTENER' && entryA ? 'AUMENTAR EN PULLBACK' : decisionResult.headline;
  const quickPositions = useMemo(() => [...positions].filter((p) => p.quantity > 0).sort((a,b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0,7), [positions]);
  const targetUpside = fundamentals?.analystTargetPrice && currentPrice ? fundamentals.analystTargetPrice / currentPrice - 1 : undefined;
  const isWatched = watchlist.includes(snapshot.symbol.toUpperCase());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('senior-trading-analyst:watchlist');
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setWatchlist(parsed.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase()).slice(0, 30));
    } catch {}
    setWatchlistReady(true);
  }, []);

  useEffect(() => {
    if (!watchlistReady) return;
    window.localStorage.setItem('senior-trading-analyst:watchlist', JSON.stringify(watchlist));
  }, [watchlist, watchlistReady]);

  function toggleWatchlist(symbolToToggle = snapshot.symbol) {
    const clean = symbolToToggle.trim().toUpperCase();
    if (!clean) return;
    setWatchlist((current) => current.includes(clean) ? current.filter((item) => item !== clean) : [clean, ...current].slice(0, 30));
  }

  function addManualLevel() {
    const value = Number(manualLevelInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Ingresá un nivel de precio válido.');
      return;
    }
    setManualLevels((current) => current.some((item) => Math.abs(item - value) < 0.0001) ? current : [...current, value].slice(-12));
    setManualLevelInput('');
    setError(null);
  }

  async function loadComparison(requestedSymbol = compareInput, tf: Timeframe = timeframe) {
    const clean = requestedSymbol.trim().toUpperCase();
    if (!clean || clean === snapshot.symbol.toUpperCase()) {
      setComparisonError(clean === snapshot.symbol.toUpperCase() ? 'Elegí un ticker distinto del activo principal.' : 'Ingresá un ticker para comparar.');
      return;
    }
    setCompareInput(clean);
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const response = await fetch('/api/analyze/technical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: clean, timeframe: tf }),
      });
      const result = await response.json() as TechnicalResponse;
      if (!response.ok || !result.bars) throw new Error(result.error ?? 'No fue posible cargar la comparación.');
      setComparisonSymbol(clean);
      setComparisonBars(result.bars);
    } catch (e) {
      setComparisonError(e instanceof Error ? e.message : 'Error al cargar la comparación.');
    } finally {
      setComparisonLoading(false);
    }
  }

  function clearComparison() {
    setComparisonSymbol(null);
    setComparisonBars([]);
    setComparisonError(null);
  }

  function onStrategyChange(next: Strategy) {
    setStrategy(next); const allowed = STRATEGY_TIMEFRAMES[next]; if (!allowed.includes(timeframe)) setTimeframe(allowed[0]);
  }

  async function runFullAnalysis(requestedSymbol: string) {
    const clean = requestedSymbol.trim().toUpperCase();
    if (!clean || loading) { if (!clean) setError('Ingresá un ticker válido.'); return; }
    setSymbol(clean); setTopSearch(clean); setChartRange('Todos'); setManualLevels([]);
    setLoading(true); setError(null); setNews(null); setEvents(null); setInsightsError(null);
    try {
      const [analysisResponse, portfolioResponse] = await Promise.all([
        fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: clean, strategy, timeframe }) }),
        fetch('/api/portfolio', { cache: 'no-store' }),
      ]);
      const result = await analysisResponse.json() as AnalyzeResponse;
      if (!analysisResponse.ok || !result.snapshot || !result.bars) throw new Error(result.error ?? 'No fue posible analizar el ticker.');
      const portfolio = await portfolioResponse.json() as PortfolioResponse;
      setBars(result.bars); setSnapshot(result.snapshot); setSource(result.source);
      setFundamentals(result.fundamentals ?? null); setFundamentalScore(result.fundamentalScore ?? null); setFundamentalSource(result.fundamentalSource ?? null);
      setMarketContext(result.marketContext ?? null); setPortfolioConnected(Boolean(portfolioResponse.ok && portfolio.connected)); setPortfolioBroker(portfolio.broker ?? null); setPositions(portfolio.positions ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error inesperado al analizar el ticker.'); }
    finally { setLoading(false); }
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await runFullAnalysis(symbol); }
  async function handleTopSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await runFullAnalysis(topSearch); }

  async function changeTimeframe(next: Timeframe) {
    if (next === timeframe || loading) return;
    setTimeframe(next); setChartRange('Todos'); setLoading(true); setError(null);
    try {
      const response = await fetch('/api/analyze/technical', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: snapshot.symbol, timeframe: next }) });
      const result = await response.json() as TechnicalResponse;
      if (!response.ok || !result.snapshot || !result.bars) throw new Error(result.error ?? 'No fue posible actualizar el timeframe.');
      setBars(result.bars); setSnapshot(result.snapshot); setSource(result.source ?? source);
      if (comparisonSymbol) void loadComparison(comparisonSymbol, next);
    } catch (e) { setTimeframe(snapshot.timeframe); setError(e instanceof Error ? e.message : 'Error al actualizar el timeframe.'); }
    finally { setLoading(false); }
  }

  async function loadNews() {
    setInsightsLoading('news'); setInsightsError(null);
    try {
      const response = await fetch(`/api/insights/news?symbol=${encodeURIComponent(snapshot.symbol)}`, { cache: 'no-store' });
      const data = await response.json() as NewsResponse;
      if (!response.ok) throw new Error(data.error ?? 'No fue posible obtener noticias.');
      setNews(data.items ?? []);
    } catch (e) { setInsightsError(e instanceof Error ? e.message : 'Error de noticias.'); }
    finally { setInsightsLoading(null); }
  }
  async function loadEvents() {
    setInsightsLoading('events'); setInsightsError(null);
    try {
      const response = await fetch(`/api/insights/events?symbol=${encodeURIComponent(snapshot.symbol)}`, { cache: 'no-store' });
      const data = await response.json() as EventsResponse;
      if (!response.ok) throw new Error(data.error ?? 'No fue posible obtener eventos.');
      setEvents(data.items ?? []);
    } catch (e) { setInsightsError(e instanceof Error ? e.message : 'Error de eventos.'); }
    finally { setInsightsLoading(null); }
  }

  function tabText() {
    if (analysisTab === 'technical') return `Tendencia ${snapshot.trend.toLowerCase()}, estructura ${snapshot.structure.toLowerCase()}, EMA9 ${snapshot.ema9 ?? '—'}, EMA21 ${snapshot.ema21 ?? '—'}, RSI14 ${snapshot.rsi14 ?? '—'} y ATR14 ${snapshot.atr14 ?? '—'}.`;
    if (analysisTab === 'fundamental') return fundamentals ? `${fundamentals.name ?? fundamentals.symbol}: fundamentales cargados desde ${fundamentalSource ?? 'proveedor fundamental'}.` : 'Fundamentales pendientes de proveedor.';
    if (analysisTab === 'risk') return `Riesgo máximo configurado: ${risk}% del capital. ${riskPlan?.riskReward !== undefined ? `R/R estimado: ${rrText(riskPlan.riskReward)}.` : ''}`;
    if (analysisTab === 'news') return news ? `${news.length} noticias cargadas en español bajo demanda.` : 'Las noticias no se consultan automáticamente. Cargalas sólo cuando las necesites.';
    return decisionResult.reasons.join(' ') || 'Esperando una nueva lectura del modelo.';
  }

  function researchContent() {
    if (researchTab === 'fundamental') return <FundamentalPanel fundamentals={fundamentals} score={fundamentalScore} source={fundamentalSource}/>;
    if (researchTab === 'valuation') return <div className="researchPanel"><h3>Valuación</h3><div className="researchMetricGrid">
      {metric('P/E (ttm)', fmtRatio(fundamentals?.trailingPE))}{metric('Forward P/E', fmtRatio(fundamentals?.forwardPE))}{metric('PEG', fmtRatio(fundamentals?.pegRatio))}{metric('P/S', fmtRatio(fundamentals?.priceToSales))}{metric('P/B', fmtRatio(fundamentals?.priceToBook))}{metric('EV/EBITDA', fmtRatio(fundamentals?.evToEbitda))}{metric('Score valuación', fundamentalScore ? `${fundamentalScore.valuation}/100` : '—')}{metric('Target analistas', fmtMoney(fundamentals?.analystTargetPrice, fundamentals?.currency ?? 'USD'))}
    </div></div>;
    if (researchTab === 'expectations') return <div className="researchPanel"><h3>Expectativas</h3><div className="researchMetricGrid">
      {metric('Crec. ingresos YoY', fmtPct(fundamentals?.revenueGrowthYoY))}{metric('Crec. ganancias YoY', fmtPct(fundamentals?.earningsGrowthYoY))}{metric('Target analistas', fmtMoney(fundamentals?.analystTargetPrice, fundamentals?.currency ?? 'USD'))}{metric('Upside vs. precio', targetUpside === undefined ? '—' : `${targetUpside >= 0 ? '+' : ''}${(targetUpside*100).toFixed(1)}%`)}{metric('Máx. 52 semanas', fmtMoney(fundamentals?.week52High, fundamentals?.currency ?? 'USD'))}{metric('Mín. 52 semanas', fmtMoney(fundamentals?.week52Low, fundamentals?.currency ?? 'USD'))}{metric('Growth score', fundamentalScore ? `${fundamentalScore.growth}/100` : '—')}
    </div><p className="researchNarrative">Las expectativas combinan crecimiento reportado, objetivo de analistas y posición del precio dentro del rango anual.</p></div>;
    if (researchTab === 'sector') return <div className="researchPanel"><h3>Sector</h3><div className="researchMetricGrid">
      {metric('Sector', fundamentals?.sector ?? '—')}{metric('Industria', fundamentals?.industry ?? '—')}{metric('Benchmark', marketContext?.benchmarkSymbol ?? '—')}{metric('Benchmark tendencia', trendLabel(marketContext?.benchmarkTrend))}{metric('ETF sectorial', marketContext?.sectorSymbol ?? '—')}{metric('Sector tendencia', trendLabel(marketContext?.sectorTrend))}{metric('Market score', marketContext ? `${marketContext.score}/100` : '—')}
    </div><div className="researchBullets">{marketContext?.reasons.map((reason)=><p key={reason}>• {reason}</p>) ?? <p>• Contexto sectorial pendiente.</p>}</div></div>;
    if (researchTab === 'risks') return <div className="researchPanel"><h3>Riesgos</h3><div className="researchMetricGrid">
      {metric('Beta', fmtRatio(fundamentals?.beta))}{metric('Margen neto', fmtPct(fundamentals?.profitMargin))}{metric('Margen operativo', fmtPct(fundamentals?.operatingMargin))}{metric('Stop aplicado', effectiveStop?.toFixed(2) ?? '—')}{metric('Risk / Reward', rrText(riskPlan?.riskReward))}{metric('Riesgo máximo', `${risk}% · exposición ${maxPositionPercent}%`)}
    </div><div className="researchBullets">{decisionResult.warnings.length ? decisionResult.warnings.map((warning)=><p key={warning}>• {warning}</p>) : <p>• El modelo no detecta advertencias extraordinarias adicionales.</p>}</div></div>;
    return <div className="researchGrid">
      <div className="thesisBlock"><h3>Tesis de inversión</h3><p>{decisionResult.reasons.length?decisionResult.reasons.join(' '):'La tesis se construirá con la siguiente actualización de datos técnicos y fundamentales.'}</p><div className="thesisCards"><div className="catalystCard"><h4>Catalizadores</h4>{marketContext?.reasons.slice(0,3).map((r)=><p key={r}>• {r}</p>) ?? <p>• Pendiente de contexto de mercado</p>}</div><div className="riskCard"><h4>Riesgos</h4>{decisionResult.warnings.length?decisionResult.warnings.slice(0,3).map((w)=><p key={w}>• {w}</p>):<p>• Sin advertencias extraordinarias del modelo</p>}</div></div></div>
      <div className="fundamentalBlock"><div className="fundamentalScoreHead"><h3>Fundamental Score</h3><strong>{fundamentalScore?.total ?? '—'}<small>/100</small></strong></div>{[['Quality',fundamentalScore?.quality],['Growth',fundamentalScore?.growth],['Valuation',fundamentalScore?.valuation],['Mercado',marketContext?.score]].map(([label,value])=><div className="scoreBarRow" key={String(label)}><span>{label}</span><div><i style={{width:`${typeof value==='number'?value:0}%`}}/></div><b>{typeof value==='number'?value:'—'}</b></div>)}<h4>Datos clave</h4><div className="keyDataGrid"><div><span>Market Cap</span><b>{fmtCompact(fundamentals?.marketCapitalization)}</b></div><div><span>ROE</span><b>{fmtPct(fundamentals?.returnOnEquity)}</b></div><div><span>P/E (ttm)</span><b>{fmtRatio(fundamentals?.trailingPE)}</b></div><div><span>Margen neto</span><b>{fmtPct(fundamentals?.profitMargin)}</b></div><div><span>Forward P/E</span><b>{fmtRatio(fundamentals?.forwardPE)}</b></div><div><span>PEG</span><b>{fmtRatio(fundamentals?.pegRatio)}</b></div></div></div>
    </div>;
  }

  return <main className="analystApp">
    <header className="analystTopbar">
      <div className="brandBlock"><div className="brandMark">▥</div><div><strong>SENIOR TRADING ANALYST</strong><small>Análisis técnico + fundamental + tu cartera</small></div></div>
      <nav className="primaryNav" aria-label="Navegación principal"><Link className="active" href="/">⌁ Analizar Ticker</Link><Link href="/portfolio">▣ Mi Cartera (IOL)</Link><Link href="/opportunities">⌁ Oportunidades</Link><Link href="/alerts">♧ Alertas</Link><Link href="/market">♡ Mercado</Link></nav>
      <div className="topActions"><Link href="/system" aria-label="Estado del sistema">⚙</Link><form className="topSearchForm" onSubmit={handleTopSearch}><span>⌕</span><input aria-label="Buscar ticker" placeholder="Buscar ticker…" value={topSearch} onChange={(e)=>setTopSearch(e.target.value.toUpperCase())} maxLength={20}/><button type="submit" disabled={loading || !topSearch.trim()}>{loading?'…':'Ir'}</button></form><b>TU</b></div>
    </header>
    <section className="analystGrid">
      <aside className="analystSidebar">
        <section className="surface configSurface"><h2>1. Configuración</h2><form onSubmit={handleAnalyze}>
          <label>Ticker<div className="tickerInput"><input value={symbol} onChange={(e)=>setSymbol(e.target.value.toUpperCase())} maxLength={20}/><span>⌕</span></div></label>
          <div className="tickerIdentity"><span className="tickerLogo">◉</span><div><b>{snapshot.symbol}</b><small>{fundamentals?.name ?? 'Activo seleccionado'}</small></div><button className={`watchToggle ${isWatched?'active':''}`} type="button" onClick={()=>toggleWatchlist()} aria-label={isWatched?'Quitar de Watchlist':'Agregar a Watchlist'}>{isWatched?'★':'☆'}</button></div>
          <label>Estrategia</label><div className="strategyGrid">{(Object.keys(STRATEGY_LABELS) as Strategy[]).map((item)=><button key={item} type="button" className={strategy===item?'selected':''} onClick={()=>onStrategyChange(item)}><span>{STRATEGY_LABELS[item].icon}</span><b>{STRATEGY_LABELS[item].title}</b><small>{STRATEGY_LABELS[item].subtitle}</small></button>)}</div>
          <div className="configPair"><label>Capital disponible (USD)<input inputMode="decimal" value={capital} onChange={(e)=>setCapital(e.target.value)}/></label><label>Riesgo por operación<input inputMode="decimal" value={risk} onChange={(e)=>setRisk(e.target.value)}/></label></div>
          <button className={`advancedHint ${advancedOpen?'open':''}`} type="button" onClick={()=>setAdvancedOpen((value)=>!value)}>› Configuración avanzada <span>{advancedOpen?'−':'+'}</span></button>
          {advancedOpen?<div className="advancedPanel">
            <div className="advancedField"><label>Entrada para sizing</label><select value={entryMode} onChange={(e)=>setEntryMode(e.target.value as EntryMode)}><option value="A">Zona A · conservadora</option><option value="B">Zona B · óptima</option><option value="custom">Precio personalizado</option></select></div>
            {entryMode==='custom'?<div className="advancedField"><label>Precio de entrada manual</label><input inputMode="decimal" value={customEntry} onChange={(e)=>setCustomEntry(e.target.value)} placeholder={currentPrice.toFixed(2)}/></div>:null}
            <div className="advancedField"><label>Stop para sizing</label><select value={stopMode} onChange={(e)=>setStopMode(e.target.value as StopMode)}><option value="technical">Stop técnico del modelo</option><option value="manual">Stop manual</option></select></div>
            {stopMode==='manual'?<div className="advancedField"><label>Stop manual</label><input inputMode="decimal" value={manualStop} onChange={(e)=>setManualStop(e.target.value)} placeholder={stop?.toFixed(2) ?? '0.00'}/></div>:null}
            <div className="advancedTwo"><div className="advancedField"><label>Máx. posición (%)</label><input inputMode="decimal" value={maxPositionPercent} onChange={(e)=>setMaxPositionPercent(e.target.value)}/></div><div className="advancedField"><label>Trailing ATR</label><input inputMode="decimal" value={trailingAtr} onChange={(e)=>setTrailingAtr(e.target.value)}/></div></div>
            <div className="advancedTwo"><div className="advancedField"><label>Salida TP1 (%)</label><input inputMode="decimal" value={tp1Percent} onChange={(e)=>setTp1Percent(e.target.value)}/></div><div className="advancedField"><label>Salida TP2 (%)</label><input inputMode="decimal" value={tp2Percent} onChange={(e)=>setTp2Percent(e.target.value)}/></div></div>
            <div className={`advancedSummary ${exitPlanValid?'':'invalid'}`}><span>Entrada <b>{effectiveEntry?.toFixed(2) ?? '—'}</b></span><span>Stop <b>{effectiveStop?.toFixed(2) ?? '—'}</b></span><span>Runner <b>{exitPlan.runner.toFixed(0)}%</b></span><span>Trailing <b>{exitPlan.trailing.toFixed(1)} ATR</b></span></div>
            {!exitPlanValid?<p className="advancedError">TP1 + TP2 no puede superar 100% y el trailing ATR debe ser mayor a cero.</p>:null}
          </div>:null}
          <button className="analyzePrimary" type="submit" disabled={loading}>{loading?'Analizando…':'Analizar'}</button>{error?<p className="formError">{error}</p>:null}
        </form></section>
        <section className="surface positionSurface"><h2>Tu posición en IOL</h2>{activePosition?<><div className="positionSymbol"><span className="tickerLogo">◉</span><b>{activePosition.symbol} <small>({activePosition.assetType ?? 'IOL'})</small></b></div><dl>
          <div><dt>Cantidad</dt><dd>{activePosition.quantity}</dd></div><div><dt>Precio promedio</dt><dd>{fmtMoney(activePosition.averagePrice,activePosition.currency)}</dd></div><div><dt>Precio actual</dt><dd>{fmtMoney(positionUnitPrice,activePosition.currency)}</dd></div><div><dt>Ganancia / Pérdida</dt><dd className={(positionPnlPercent??0)>=0?'positive':'negative'}>{positionPnlPercent===undefined?'—':`${positionPnlPercent>=0?'+':''}${positionPnlPercent.toFixed(1)}%`}</dd></div><div><dt>Valor de la posición</dt><dd>{fmtMoney(activePosition.marketValue,activePosition.currency)}</dd></div><div><dt>Peso en la cartera</dt><dd>{portfolioFit?`${portfolioFit.currentWeightPercent.toFixed(1)}%`:'—'}</dd></div>
        </dl><div className="positionActions"><a href="https://www.invertironline.com" target="_blank" rel="noreferrer">Ver en IOL</a><Link href="/sandbox">Operar</Link></div></>:<p className="mutedText">{portfolioConnected?'El ticker no forma parte de tu cartera actual.':'La cartera IOL se carga al ejecutar el análisis.'}</p>}</section>
        <section className="surface quickSurface">
          <h2>Lista rápida</h2>
          <div className="quickTabs">
            <button className={quickTab==='portfolio'?'active':''} onClick={()=>setQuickTab('portfolio')}>Mis tickers</button>
            <button className={quickTab==='watchlist'?'active':''} onClick={()=>setQuickTab('watchlist')}>Watchlist</button>
          </div>
          {quickTab==='portfolio' ? (
            quickPositions.length ? quickPositions.map((p)=>
              <button className={`quickTicker ${snapshot.symbol.toUpperCase()===p.symbol.toUpperCase()?'selected':''}`} key={p.symbol} type="button" disabled={loading} onClick={()=>void runFullAnalysis(p.symbol)}>
                <span>◉</span><b>{p.symbol}</b><small>{totalPortfolioValue>0&&p.marketValue?`${((p.marketValue/totalPortfolioValue)*100).toFixed(1)}% cartera`:`${p.quantity} u.`}</small>
              </button>
            ) : <p className="mutedText">Analizá un ticker para cargar posiciones IOL.</p>
          ) : (
            watchlist.length ? <div className="watchlistRows">{watchlist.map((ticker)=>
              <div className={`watchlistRow ${snapshot.symbol.toUpperCase()===ticker?'selected':''}`} key={ticker}>
                <button type="button" disabled={loading} onClick={()=>void runFullAnalysis(ticker)}><span>☆</span><b>{ticker}</b><small>Analizar</small></button>
                <button className="watchRemove" type="button" onClick={()=>toggleWatchlist(ticker)} aria-label={`Quitar ${ticker} de Watchlist`}>×</button>
              </div>
            )}</div> : <p className="mutedText">Agregá tickers con la estrella ☆ junto al activo analizado.</p>
          )}
        </section>
      </aside>
      <section className="analystCenter">
        <section className="surface chartSurface"><div className="chartToolbar"><div className="timeframeRow">{STRATEGY_TIMEFRAMES[strategy].map((item)=><button key={item} className={timeframe===item?'active':''} disabled={loading} onClick={()=>void changeTimeframe(item)}>{item==='1d'?'D':item==='1w'?'S':item==='1M'?'M':item}</button>)}</div><div className="chartTools"><span>⌁ Indicadores</span><button type="button" className={chartToolPanel==='drawings'?'active':''} onClick={()=>setChartToolPanel(chartToolPanel==='drawings'?null:'drawings')}>⌁ Dibujos</button><button type="button" className={chartToolPanel==='compare'?'active':''} onClick={()=>setChartToolPanel(chartToolPanel==='compare'?null:'compare')}>◉ Comparar</button><span>⚙</span><span>⛶</span></div></div>
          {chartToolPanel==='drawings'?<div className="chartToolPanel"><div><b>Dibujos manuales</b><small>Líneas horizontales por precio</small></div><input inputMode="decimal" placeholder={currentPrice.toFixed(2)} value={manualLevelInput} onChange={(e)=>setManualLevelInput(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();addManualLevel();}}}/><button type="button" onClick={addManualLevel}>Agregar nivel</button><button type="button" className="secondary" disabled={!manualLevels.length} onClick={()=>setManualLevels([])}>Limpiar</button>{manualLevels.length?<span>{manualLevels.map((level)=>level.toFixed(2)).join(' · ')}</span>:null}</div>:null}
          {chartToolPanel==='compare'?<div className="chartToolPanel"><div><b>Comparar rendimiento</b><small>Serie normalizada al inicio del rango visible</small></div><div className="comparePresets"><button type="button" onClick={()=>void loadComparison('SPY')}>SPY</button><button type="button" onClick={()=>void loadComparison('QQQ')}>QQQ</button></div><input placeholder="Ticker" value={compareInput} onChange={(e)=>setCompareInput(e.target.value.toUpperCase())} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();void loadComparison();}}}/><button type="button" disabled={comparisonLoading} onClick={()=>void loadComparison()}>{comparisonLoading?'Cargando…':'Comparar'}</button>{comparisonSymbol?<button type="button" className="secondary" onClick={clearComparison}>Quitar {comparisonSymbol}</button>:null}{comparisonError?<span className="toolError">{comparisonError}</span>:null}</div>:null}
          <div className="instrumentStrip"><div><span className="tickerLogo">◉</span><b>{fundamentals?.name ?? snapshot.symbol}</b><small> · {snapshot.timeframe.toUpperCase()} · {fundamentals?.sector ?? 'Mercado'}</small></div><div className="priceStrip"><b>{currentPrice.toFixed(2)}</b><span>{snapshot.trend==='BULL'?'Tendencia alcista':snapshot.trend==='BEAR'?'Tendencia bajista':'Tendencia neutral'}</span></div></div>
          <TechnicalChart bars={visibleBars} snapshot={snapshot} comparisonBars={comparisonBars} comparisonSymbol={comparisonSymbol} manualLevels={manualLevels}/><div className="chartFooter">{CHART_RANGES.map((range)=><button type="button" key={range} className={chartRange===range?'active':''} onClick={()=>setChartRange(range)}>{range}</button>)}<small>{source==='demo-fixture'?'DEMO':source} · {visibleBars.length}/{bars.length} velas</small></div>
        </section>
        <section className="surface researchSurface"><h2>Análisis y fundamentos</h2><div className="researchTabs">{RESEARCH_TABS.map(([tab,label])=><button key={tab} className={researchTab===tab?'active':''} onClick={()=>setResearchTab(tab)}>{label}</button>)}</div>{researchContent()}</section>
      </section>
      <aside className="analystRight">
        <section className="surface decisionSurface"><div className="rightTitle"><h2>{snapshot.symbol} - Análisis Integral</h2><div className="rightTabs rightTabsFive">{TABS.map(([tab,label])=><button key={tab} className={analysisTab===tab?'active':''} onClick={()=>setAnalysisTab(tab)}>{label}</button>)}</div></div>
          <div className="decisionHero"><div><small>DECISIÓN</small><h1>{decisionResult.headline}</h1><h3>{decisionSecondary}</h3></div><div className="gauge" style={{background:`conic-gradient(#3ee1a5 0 ${scoreCard.conviction}%, #143245 ${scoreCard.conviction}% 100%)`}}><div><b>{scoreCard.conviction}</b><small>/100</small></div></div><p>{tabText()}</p></div>
          {analysisTab==='news'?<div className="insightsPanel"><div className="sectionHead"><h3>Noticias verificadas · Español</h3><button onClick={()=>void loadNews()} disabled={insightsLoading==='news'}>{insightsLoading==='news'?'Traduciendo…':'Cargar noticias'}</button></div>{insightsError?<p className="formError">{insightsError}</p>:null}{news===null?<p className="mutedText">Carga manual y traducción automática al español para preservar el cupo de proveedores.</p>:news.length?news.slice(0,6).map((item)=><a className="newsItem" href={item.url} target="_blank" rel="noreferrer" title={item.originalTitle ? `Original: ${item.originalTitle}` : item.title} key={`${item.url}-${item.title}`}><b>{item.title}</b><span>{item.source ?? 'Fuente'} · {dateLabel(item.publishedAt)} · {item.translationLanguage==='es'?'traducido al español':'idioma original'} · {item.sentiment ?? 'sin sentimiento'}</span></a>):<p className="mutedText">No se encontraron noticias recientes para este ticker.</p>}</div>:analysisTab==='fundamental'?<FundamentalPanel fundamentals={fundamentals} score={fundamentalScore} source={fundamentalSource}/>:<><div className="scoreTiles"><div><span>Técnico</span><b>{technicalScore}</b></div><div><span>Fundamental</span><b>{fundamentalScore?.total ?? '—'}</b></div><div><span>Valuación</span><b>{fundamentalScore?.valuation ?? '—'}</b></div><div><span>Mercado</span><b>{marketContext?.score ?? '—'}</b></div><div><span>Riesgo</span><b>{riskRewardScore}</b></div></div><div className="rightColumns"><div className="levelsCard"><h3>Niveles Clave (USD - subyacente)</h3><dl><div><dt>Precio actual</dt><dd>{currentPrice.toFixed(2)}</dd></div><div><dt>Zona de entrada A</dt><dd>{zoneText(entryA)}</dd></div><div><dt>Zona de entrada B</dt><dd>{zoneText(entryB)}</dd></div><div className="danger"><dt>Stop / Invalidación</dt><dd>{stop?.toFixed(2) ?? '—'}</dd></div><div className="good"><dt>TP1</dt><dd>{tp1?.toFixed(2) ?? '—'}</dd></div><div className="good"><dt>TP2</dt><dd>{tp2?.toFixed(2) ?? '—'}</dd></div></dl></div><div className="managementCard"><h3>Gestión de posición</h3>{riskPlan?<dl><div><dt>Entrada aplicada</dt><dd>{effectiveEntry?.toFixed(2) ?? '—'}</dd></div><div><dt>Stop aplicado</dt><dd>{effectiveStop?.toFixed(2) ?? '—'}</dd></div><div><dt>Riesgo por unidad</dt><dd>{fmtMoney(riskPlan.riskPerUnit)}</dd></div><div><dt>Tamaño máximo</dt><dd>{riskPlan.quantity} acciones</dd></div><div><dt>Valor posición</dt><dd>{fmtMoney(riskPlan.positionValue)}</dd></div><div><dt>Uso de capital</dt><dd>{riskPlan.capitalUtilizationPercent.toFixed(1)}%</dd></div><div><dt>Riesgo total</dt><dd>{fmtMoney(riskPlan.riskBudget)}</dd></div><div><dt>Risk / Reward</dt><dd>{rrText(riskPlan.riskReward)}</dd></div></dl>:<p className="mutedText">Revisá entrada, stop y límites en Configuración avanzada.</p>}<h4>Estrategia de salida</h4><p>• {exitPlan.tp1.toFixed(0)}% en TP1<br/>• {exitPlan.tp2.toFixed(0)}% en TP2<br/>• {exitPlan.runner.toFixed(0)}% runner con trailing {exitPlan.trailing.toFixed(1)} ATR</p></div></div></>}
        </section>
        <section className="surface marketSurface"><div className="sectionHead"><h2>Contexto de Mercado</h2><Link href="/market">Abrir mercado</Link></div>{marketContext?<><div className="marketRow"><span>◎ {marketContext.benchmarkSymbol}</span><b>{trendLabel(marketContext.benchmarkTrend)}</b><small>Score {marketContext.score}</small></div><div className="marketRow"><span>◎ {marketContext.sectorSymbol ?? 'Sector'}</span><b>{trendLabel(marketContext.sectorTrend)}</b><small>Contexto sectorial</small></div>{marketContext.reasons.slice(0,3).map((r)=><div className="marketReason" key={r}>• {r}</div>)}</>:<p className="mutedText">Contexto pendiente de datos reales.</p>}</section>
        <section className="surface eventsSurface"><div className="sectionHead"><h2>Próximos eventos</h2><button onClick={()=>void loadEvents()} disabled={insightsLoading==='events'}>{insightsLoading==='events'?'Cargando…':'Cargar'}</button></div>{insightsError?<p className="formError">{insightsError}</p>:null}{events===null?<div className="eventPlaceholder"><b>Resultados · dividendos · Investor Day</b><small>Consulta manual para preservar el cupo del proveedor.</small></div>:events.length?events.slice(0,4).map((event)=><div className="eventRow" key={`${event.symbol}-${event.reportDate}`}><b>Resultados</b><span>{dateLabel(event.reportDate)}</span><small>{event.name ?? event.symbol}</small></div>):<div className="eventPlaceholder"><b>Sin eventos encontrados</b><small>No hay resultados programados informados por el proveedor.</small></div>}</section>
      </aside>
    </section>
    <footer className="analystFooter"><span>{portfolioConnected?`${portfolioBroker ?? 'IOL'} · ${positions.length} posiciones conectadas`:'IOL se carga al analizar'}</span><span>Redis + Telegram + Monitor 24/7</span><span>{fundamentalSource ?? 'Fundamentales pendientes'}</span></footer>
  </main>;
}
