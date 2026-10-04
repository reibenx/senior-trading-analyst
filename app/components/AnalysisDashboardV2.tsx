'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
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
interface PortfolioResponse { connected: boolean; broker: string | null; positions: Position[]; error?: string }
interface NewsResponse { items?: NewsInsight[]; error?: string; source?: string }
interface EventsResponse { items?: EarningsEvent[]; error?: string; source?: string }
type AnalysisTab = 'summary' | 'technical' | 'fundamental' | 'risk' | 'news';

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

export function AnalysisDashboardV2({ initialBars, initialSnapshot }: Props) {
  const [symbol, setSymbol] = useState(initialSnapshot.symbol);
  const [strategy, setStrategy] = useState<Strategy>('swing');
  const [timeframe, setTimeframe] = useState<Timeframe>(initialSnapshot.timeframe);
  const [capital, setCapital] = useState('5000');
  const [risk, setRisk] = useState('1.0');
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

  const technicalScore = useMemo(() => calculateTechnicalScore(snapshot), [snapshot]);
  const entryA = getZoneValue(snapshot, 'entry-a');
  const entryB = getZoneValue(snapshot, 'entry-b');
  const stop = getLineValue(snapshot, 'stop');
  const tp1 = getLineValue(snapshot, 'tp1');
  const tp2 = getLineValue(snapshot, 'tp2');
  const currentPrice = bars.at(-1)?.close ?? 0;

  const riskPlan = useMemo(() => {
    const c = Number(capital.replace(',', '.')); const r = Number(risk.replace(',', '.'));
    if (!entryA || stop === undefined) return null;
    return calculatePositionSizing({ capital: c, riskPercent: r, entryPrice: entryA.high, stopPrice: stop, targetPrice: tp2 ?? tp1 });
  }, [capital, risk, entryA, stop, tp1, tp2]);
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

  function onStrategyChange(next: Strategy) {
    setStrategy(next); const allowed = STRATEGY_TIMEFRAMES[next]; if (!allowed.includes(timeframe)) setTimeframe(allowed[0]);
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = symbol.trim().toUpperCase();
    if (!clean) { setError('Ingresá un ticker válido.'); return; }
    setLoading(true); setError(null); setNews(null); setEvents(null); setInsightsError(null);
    try {
      const [analysisResponse, portfolioResponse] = await Promise.all([
        fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: clean, strategy, timeframe }) }),
        fetch('/api/portfolio', { cache: 'no-store' }),
      ]);
      const result = await analysisResponse.json() as AnalyzeResponse;
      if (!analysisResponse.ok || !result.snapshot || !result.bars) throw new Error(result.error ?? 'No fue posible analizar el ticker.');
      const portfolio = await portfolioResponse.json() as PortfolioResponse;
      setSymbol(clean); setBars(result.bars); setSnapshot(result.snapshot); setSource(result.source);
      setFundamentals(result.fundamentals ?? null); setFundamentalScore(result.fundamentalScore ?? null); setFundamentalSource(result.fundamentalSource ?? null);
      setMarketContext(result.marketContext ?? null); setPortfolioConnected(Boolean(portfolioResponse.ok && portfolio.connected)); setPortfolioBroker(portfolio.broker ?? null); setPositions(portfolio.positions ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error inesperado al analizar el ticker.'); }
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
    if (analysisTab === 'fundamental') return fundamentals ? `${fundamentals.name ?? fundamentals.symbol}: quality ${fundamentalScore?.quality ?? '—'}, growth ${fundamentalScore?.growth ?? '—'} y valuation ${fundamentalScore?.valuation ?? '—'}.` : 'Fundamentales pendientes de proveedor.';
    if (analysisTab === 'risk') return `Riesgo máximo configurado: ${risk}% del capital. ${riskPlan?.riskReward !== undefined ? `R/R estimado: ${rrText(riskPlan.riskReward)}.` : ''}`;
    if (analysisTab === 'news') return news ? `${news.length} noticias cargadas bajo demanda y cacheadas para proteger el cupo del proveedor.` : 'Las noticias no se consultan automáticamente. Cargalas sólo cuando las necesites.';
    return decisionResult.reasons.join(' ') || 'Esperando una nueva lectura del modelo.';
  }

  return <main className="analystApp">
    <header className="analystTopbar">
      <div className="brandBlock"><div className="brandMark">▥</div><div><strong>SENIOR TRADING ANALYST</strong><small>Análisis técnico + fundamental + tu cartera</small></div></div>
      <nav className="primaryNav" aria-label="Navegación principal">
        <Link className="active" href="/">⌁ Analizar Ticker</Link><Link href="/portfolio">▣ Mi Cartera (IOL)</Link><Link href="/opportunities">⌁ Oportunidades</Link><Link href="/alerts">♧ Alertas</Link><Link href="/market">♡ Mercado</Link>
      </nav>
      <div className="topActions"><Link href="/system">⚙</Link><span>⌕ Buscar ticker…</span><b>TU</b></div>
    </header>

    <section className="analystGrid">
      <aside className="analystSidebar">
        <section className="surface configSurface"><h2>1. Configuración</h2><form onSubmit={handleAnalyze}>
          <label>Ticker<div className="tickerInput"><input value={symbol} onChange={(e)=>setSymbol(e.target.value.toUpperCase())} maxLength={20}/><span>⌕</span></div></label>
          <div className="tickerIdentity"><span className="tickerLogo">◉</span><div><b>{snapshot.symbol}</b><small>{fundamentals?.name ?? 'Activo seleccionado'}</small></div></div>
          <label>Estrategia</label><div className="strategyGrid">{(Object.keys(STRATEGY_LABELS) as Strategy[]).map((item)=><button key={item} type="button" className={strategy===item?'selected':''} onClick={()=>onStrategyChange(item)}><span>{STRATEGY_LABELS[item].icon}</span><b>{STRATEGY_LABELS[item].title}</b><small>{STRATEGY_LABELS[item].subtitle}</small></button>)}</div>
          <div className="configPair"><label>Capital disponible (USD)<input inputMode="decimal" value={capital} onChange={(e)=>setCapital(e.target.value)}/></label><label>Riesgo por operación<input inputMode="decimal" value={risk} onChange={(e)=>setRisk(e.target.value)}/></label></div>
          <div className="advancedHint">› Configuración avanzada</div><button className="analyzePrimary" type="submit" disabled={loading}>{loading?'Analizando…':'Analizar'}</button>{error?<p className="formError">{error}</p>:null}
        </form></section>

        <section className="surface positionSurface"><h2>Tu posición en IOL</h2>{activePosition?<><div className="positionSymbol"><span className="tickerLogo">◉</span><b>{activePosition.symbol} <small>({activePosition.assetType ?? 'IOL'})</small></b></div><dl>
          <div><dt>Cantidad</dt><dd>{activePosition.quantity}</dd></div><div><dt>Precio promedio</dt><dd>{fmtMoney(activePosition.averagePrice,activePosition.currency)}</dd></div><div><dt>Precio actual</dt><dd>{fmtMoney(positionUnitPrice,activePosition.currency)}</dd></div><div><dt>Ganancia / Pérdida</dt><dd className={(positionPnlPercent??0)>=0?'positive':'negative'}>{positionPnlPercent===undefined?'—':`${positionPnlPercent>=0?'+':''}${positionPnlPercent.toFixed(1)}%`}</dd></div><div><dt>Valor de la posición</dt><dd>{fmtMoney(activePosition.marketValue,activePosition.currency)}</dd></div><div><dt>Peso en la cartera</dt><dd>{portfolioFit?`${portfolioFit.currentWeightPercent.toFixed(1)}%`:'—'}</dd></div>
        </dl><div className="positionActions"><a href="https://www.invertironline.com" target="_blank" rel="noreferrer">Ver en IOL</a><Link href="/sandbox">Operar</Link></div></>:<p className="mutedText">{portfolioConnected?'El ticker no forma parte de tu cartera actual.':'La cartera IOL se carga al ejecutar el análisis.'}</p>}</section>

        <section className="surface quickSurface"><h2>Lista rápida</h2><div className="quickTabs"><button className="active">Mis tickers</button><button>Watchlist</button></div>{quickPositions.length?quickPositions.map((p)=><button className="quickTicker" key={p.symbol} type="button" onClick={()=>setSymbol(p.symbol)}><span>◉</span><b>{p.symbol}</b><small>{totalPortfolioValue>0&&p.marketValue?`${((p.marketValue/totalPortfolioValue)*100).toFixed(1)}% cartera`:`${p.quantity} u.`}</small></button>):<p className="mutedText">Analizá un ticker para cargar posiciones IOL.</p>}</section>
      </aside>

      <section className="analystCenter">
        <section className="surface chartSurface"><div className="chartToolbar"><div className="timeframeRow">{STRATEGY_TIMEFRAMES[strategy].map((item)=><button key={item} className={timeframe===item?'active':''} onClick={()=>setTimeframe(item)}>{item==='1d'?'D':item==='1w'?'S':item==='1M'?'M':item}</button>)}</div><div className="chartTools"><span>⌁ Indicadores</span><span>⌁ Dibujos</span><span>◉ Comparar</span><span>⚙</span><span>⛶</span></div></div>
          <div className="instrumentStrip"><div><span className="tickerLogo">◉</span><b>{fundamentals?.name ?? snapshot.symbol}</b><small> · {snapshot.timeframe.toUpperCase()} · {fundamentals?.sector ?? 'Mercado'}</small></div><div className="priceStrip"><b>{currentPrice.toFixed(2)}</b><span>{snapshot.trend==='BULL'?'Tendencia alcista':snapshot.trend==='BEAR'?'Tendencia bajista':'Tendencia neutral'}</span></div></div>
          <TechnicalChart bars={bars} snapshot={snapshot}/><div className="chartFooter"><span>1D</span><span>5D</span><span>1M</span><span>3M</span><span>6M</span><span>YTD</span><span>1A</span><span>5A</span><span>Todos</span><small>{source==='demo-fixture'?'DEMO':source}</small></div>
        </section>

        <section className="surface researchSurface"><h2>Análisis y fundamentos</h2><div className="researchTabs"><button className="active">Resumen</button><button>Fundamental</button><button>Valuación</button><button>Expectativas</button><button>Sector</button><button>Riesgos</button></div><div className="researchGrid">
          <div className="thesisBlock"><h3>Tesis de inversión</h3><p>{decisionResult.reasons.length?decisionResult.reasons.join(' '):'La tesis se construirá con la siguiente actualización de datos técnicos y fundamentales.'}</p><div className="thesisCards"><div className="catalystCard"><h4>Catalizadores</h4>{marketContext?.reasons.slice(0,3).map((r)=><p key={r}>• {r}</p>) ?? <p>• Pendiente de contexto de mercado</p>}</div><div className="riskCard"><h4>Riesgos</h4>{decisionResult.warnings.length?decisionResult.warnings.slice(0,3).map((w)=><p key={w}>• {w}</p>):<p>• Sin advertencias extraordinarias del modelo</p>}</div></div></div>
          <div className="fundamentalBlock"><div className="fundamentalScoreHead"><h3>Fundamental Score</h3><strong>{fundamentalScore?.total ?? '—'}<small>/100</small></strong></div>{[['Quality',fundamentalScore?.quality],['Growth',fundamentalScore?.growth],['Valuation',fundamentalScore?.valuation],['Mercado',marketContext?.score]].map(([label,value])=><div className="scoreBarRow" key={String(label)}><span>{label}</span><div><i style={{width:`${typeof value==='number'?value:0}%`}}/></div><b>{typeof value==='number'?value:'—'}</b></div>)}<h4>Datos clave</h4><div className="keyDataGrid"><div><span>Market Cap</span><b>{fmtCompact(fundamentals?.marketCapitalization)}</b></div><div><span>ROE</span><b>{fmtPct(fundamentals?.returnOnEquity)}</b></div><div><span>P/E (ttm)</span><b>{fmtRatio(fundamentals?.trailingPE)}</b></div><div><span>Margen neto</span><b>{fmtPct(fundamentals?.profitMargin)}</b></div><div><span>Forward P/E</span><b>{fmtRatio(fundamentals?.forwardPE)}</b></div><div><span>PEG</span><b>{fmtRatio(fundamentals?.pegRatio)}</b></div></div></div>
        </div></section>
      </section>

      <aside className="analystRight">
        <section className="surface decisionSurface"><div className="rightTitle"><h2>{snapshot.symbol} - Análisis Integral</h2><div className="rightTabs rightTabsFive">{TABS.map(([tab,label])=><button key={tab} className={analysisTab===tab?'active':''} onClick={()=>setAnalysisTab(tab)}>{label}</button>)}</div></div>
          <div className="decisionHero"><div><small>DECISIÓN</small><h1>{decisionResult.headline}</h1><h3>{decisionSecondary}</h3></div><div className="gauge" style={{background:`conic-gradient(#3ee1a5 0 ${scoreCard.conviction}%, #143245 ${scoreCard.conviction}% 100%)`}}><div><b>{scoreCard.conviction}</b><small>/100</small></div></div><p>{tabText()}</p></div>
          {analysisTab==='news'?<div className="insightsPanel"><div className="sectionHead"><h3>Noticias verificadas</h3><button onClick={()=>void loadNews()} disabled={insightsLoading==='news'}>{insightsLoading==='news'?'Cargando…':'Cargar noticias'}</button></div>{insightsError?<p className="formError">{insightsError}</p>:null}{news===null?<p className="mutedText">Carga manual para preservar el cupo de Alpha Vantage.</p>:news.length?news.slice(0,6).map((item)=><a className="newsItem" href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${item.title}`}><b>{item.title}</b><span>{item.source ?? 'Fuente'} · {dateLabel(item.publishedAt)} · {item.sentiment ?? 'sin sentimiento'}</span></a>):<p className="mutedText">No se encontraron noticias recientes para este ticker.</p>}</div>:<><div className="scoreTiles"><div><span>Técnico</span><b>{technicalScore}</b></div><div><span>Fundamental</span><b>{fundamentalScore?.total ?? '—'}</b></div><div><span>Valuación</span><b>{fundamentalScore?.valuation ?? '—'}</b></div><div><span>Mercado</span><b>{marketContext?.score ?? '—'}</b></div><div><span>Riesgo</span><b>{riskRewardScore}</b></div></div><div className="rightColumns"><div className="levelsCard"><h3>Niveles Clave (USD - subyacente)</h3><dl><div><dt>Precio actual</dt><dd>{currentPrice.toFixed(2)}</dd></div><div><dt>Zona de entrada A</dt><dd>{zoneText(entryA)}</dd></div><div><dt>Zona de entrada B</dt><dd>{zoneText(entryB)}</dd></div><div className="danger"><dt>Stop / Invalidación</dt><dd>{stop?.toFixed(2) ?? '—'}</dd></div><div className="good"><dt>TP1</dt><dd>{tp1?.toFixed(2) ?? '—'}</dd></div><div className="good"><dt>TP2</dt><dd>{tp2?.toFixed(2) ?? '—'}</dd></div></dl></div><div className="managementCard"><h3>Gestión de posición</h3>{riskPlan?<dl><div><dt>Riesgo por unidad</dt><dd>{fmtMoney(riskPlan.riskPerUnit)}</dd></div><div><dt>Tamaño máximo</dt><dd>{riskPlan.quantity} acciones</dd></div><div><dt>Riesgo total</dt><dd>{fmtMoney(riskPlan.riskBudget)}</dd></div><div><dt>Risk / Reward</dt><dd>{rrText(riskPlan.riskReward)}</dd></div></dl>:<p className="mutedText">Se calculará al disponer de entrada y stop.</p>}<h4>Estrategia de salida</h4><p>• 25% en TP1<br/>• 25% en TP2<br/>• 50% runner con trailing estructural</p></div></div></>}
        </section>

        <section className="surface marketSurface"><div className="sectionHead"><h2>Contexto de Mercado</h2><Link href="/market">Abrir mercado</Link></div>{marketContext?<><div className="marketRow"><span>◎ {marketContext.benchmarkSymbol}</span><b>{trendLabel(marketContext.benchmarkTrend)}</b><small>Score {marketContext.score}</small></div><div className="marketRow"><span>◎ {marketContext.sectorSymbol ?? 'Sector'}</span><b>{trendLabel(marketContext.sectorTrend)}</b><small>Contexto sectorial</small></div>{marketContext.reasons.slice(0,3).map((r)=><div className="marketReason" key={r}>• {r}</div>)}</>:<p className="mutedText">Contexto pendiente de datos reales.</p>}</section>

        <section className="surface eventsSurface"><div className="sectionHead"><h2>Próximos eventos</h2><button onClick={()=>void loadEvents()} disabled={insightsLoading==='events'}>{insightsLoading==='events'?'Cargando…':'Cargar'}</button></div>{insightsError?<p className="formError">{insightsError}</p>:null}{events===null?<div className="eventPlaceholder"><b>Resultados · dividendos · Investor Day</b><small>Consulta manual para preservar el cupo del proveedor.</small></div>:events.length?events.slice(0,4).map((event)=><div className="eventRow" key={`${event.symbol}-${event.reportDate}`}><b>Resultados</b><span>{dateLabel(event.reportDate)}</span><small>{event.name ?? event.symbol}</small></div>):<div className="eventPlaceholder"><b>Sin eventos encontrados</b><small>No hay resultados programados informados por el proveedor.</small></div>}</section>
      </aside>
    </section>

    <footer className="analystFooter"><span>{portfolioConnected?`${portfolioBroker ?? 'IOL'} · ${positions.length} posiciones conectadas`:'IOL se carga al analizar'}</span><span>Redis + Telegram + Monitor 24/7</span><span>{fundamentalSource ?? 'Fundamentales pendientes'}</span></footer>
  </main>;
}
