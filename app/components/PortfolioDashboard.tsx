'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  CedearExecutionBatch,
  CedearExecutionIntent,
  CedearRevalidationResult,
} from '@/core/domain/cedear';
import type { PortfolioOpportunitySummary } from '@/core/domain/opportunity';
import type { Strategy } from '@/core/domain/trading';

interface ApiError {
  error?: string;
}

interface RevalidationResponse extends ApiError {
  generatedAt?: string;
  readyCount?: number;
  blockedCount?: number;
  results?: CedearRevalidationResult[];
}

function actionLabel(action: string) {
  return action.replaceAll('_', ' ');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function scoreDrivers(item: PortfolioOpportunitySummary['opportunities'][number]) {
  const b = item.scoreBreakdown;
  if (!b) return 'Desglose no disponible';
  const positive = [
    ['Conv.', b.conviction],
    ['Prior.', b.signalPriority],
    ['Fit', b.portfolioFit],
    ['Val.', b.valuation],
    ['Entrada', b.entryProximity],
    ['Merc.', b.market],
  ].map(([label, value]) => `${label} +${Number(value).toFixed(1)}`).join(' · ');
  const adjustments = [
    b.regimeAdjustment ? `Régimen ${b.regimeAdjustment > 0 ? '+' : ''}${b.regimeAdjustment}` : null,
    b.contextAdjustment ? `Contexto ${b.contextAdjustment > 0 ? '+' : ''}${b.contextAdjustment}` : null,
    b.concentrationPenalty ? `Concentración -${b.concentrationPenalty}` : null,
  ].filter(Boolean).join(' · ');
  return adjustments ? `${positive} · ${adjustments}` : positive;
}

export function PortfolioDashboard() {
  const [strategy, setStrategy] = useState<Strategy>('position');
  const [maxSymbols, setMaxSymbols] = useState(25);
  const [monthlyCapital, setMonthlyCapital] = useState('1000');
  const [data, setData] = useState<PortfolioOpportunitySummary | null>(null);
  const [execution, setExecution] = useState<CedearExecutionBatch | null>(null);
  const [revalidation, setRevalidation] = useState<RevalidationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [revalidationLoading, setRevalidationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  async function analyzePortfolio() {
    setLoading(true);
    setError(null);
    setExecution(null);
    setRevalidation(null);
    setExecutionError(null);
    try {
      const parsedCapital = Number(monthlyCapital.replace(',', '.'));
      const response = await fetch('/api/portfolio/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          maxSymbols,
          monthlyCapital: Number.isFinite(parsedCapital) && parsedCapital >= 0 ? parsedCapital : 0,
          maxAllocationIdeas: 4,
        }),
      });
      const result = await response.json() as PortfolioOpportunitySummary & ApiError;
      if (!response.ok) throw new Error(result.error ?? 'No fue posible analizar la cartera.');
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function previewExecution() {
    if (!data?.allocationPlan) return;
    setExecutionLoading(true);
    setExecutionError(null);
    setRevalidation(null);
    try {
      const response = await fetch('/api/portfolio/execution-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocation: data.allocationPlan, maxConversionAgeMinutes: 30 }),
      });
      const result = await response.json() as CedearExecutionBatch & ApiError;
      if (!response.ok) throw new Error(result.error ?? 'No fue posible generar la previsualización de ejecución.');
      setExecution(result);
    } catch (requestError) {
      setExecutionError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setExecutionLoading(false);
    }
  }

  async function revalidateExecution() {
    if (!execution) return;
    const intents: CedearExecutionIntent[] = execution.items
      .filter((item) => item.executable && item.plan && item.conversion)
      .map((item) => ({
        symbol: item.symbol,
        allocationUsd: item.allocationUsd,
        previewLocalPriceArs: item.plan!.localPriceArs,
        previewQuantity: item.plan!.quantity,
        previewCclArsPerUsd: item.plan!.cclArsPerUsd,
        previewRatio: item.plan!.cedearsPerUnderlyingShare,
        previewedAt: execution.generatedAt,
      }));

    if (!intents.length) {
      setExecutionError('No hay ideas ejecutables para revalidar.');
      return;
    }

    setRevalidationLoading(true);
    setExecutionError(null);
    try {
      const response = await fetch('/api/portfolio/execution/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intents,
          maxQuoteAgeSeconds: 120,
          maxPriceDriftPercent: 1,
          maxCclDriftPercent: 1.5,
        }),
      });
      const result = await response.json() as RevalidationResponse;
      if (!response.ok) throw new Error(result.error ?? 'No fue posible revalidar la ejecución.');
      setRevalidation(result);
    } catch (requestError) {
      setExecutionError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setRevalidationLoading(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <strong>MI CARTERA IOL</strong>
        <span>Opportunity ranking · Portfolio fit · Senior Trading Analyst</span>
        <Link className="topLink" href="/">Analizar ticker</Link>
      </header>

      <section className="portfolioShell">
        <div className="panel portfolioControls portfolioControlsExtended">
          <div>
            <span className="eyebrow">ESTRATEGIA DE RANKING</span>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
              <option value="position">Position Trading</option>
              <option value="swing">Swing Trading</option>
              <option value="day">Day Trading</option>
            </select>
          </div>
          <div>
            <span className="eyebrow">CAPITAL MENSUAL USD</span>
            <input inputMode="decimal" value={monthlyCapital} onChange={(event) => setMonthlyCapital(event.target.value)} />
          </div>
          <div>
            <span className="eyebrow">MÁX. ACTIVOS</span>
            <select value={maxSymbols} onChange={(event) => setMaxSymbols(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button onClick={analyzePortfolio} disabled={loading}>{loading ? 'Analizando cartera…' : 'Analizar cartera IOL'}</button>
        </div>

        {error ? <div className="panel portfolioError">{error}</div> : null}

        {data ? (
          <>
            <div className="portfolioSummary">
              <div className="panel metricCard"><span>Activos analizados</span><strong>{data.analyzed}</strong></div>
              <div className="panel metricCard"><span>Sin resolver</span><strong>{data.failed}</strong></div>
              <div className="panel metricCard"><span>Valor cartera</span><strong>{formatMoney(data.portfolioValue)}</strong><small>moneda del bridge</small></div>
              <div className="panel metricCard"><span>#1 nuevo capital</span><strong>{data.opportunities[0]?.symbol ?? '—'}</strong><small>{data.opportunities[0] ? `${data.opportunities[0].opportunityScore}/100 · ${data.opportunities[0].signalPriorityLevel ?? 'N/D'}` : 'sin ranking'}</small></div>
            </div>
            {data.opportunities.length ? (
              <section className="panel seniorRankingPanel">
                <div className="portfolioTitle">
                  <div><span className="eyebrow">RANKING SENIOR · CAPITAL MARGINAL</span><h1>Mejores destinos para el próximo aporte</h1></div>
                  <small>Prioriza señal, régimen, portfolio fit, valuación, proximidad a entrada y concentración actual.</small>
                </div>
                <div className="seniorPodium">
                  {data.opportunities.slice(0,3).map((item,index) => (
                    <article key={item.symbol} className={`seniorPodiumCard seniorPodium-${index+1}`}>
                      <span>#{index+1}</span><h2>{item.symbol}</h2><strong>{item.opportunityScore}</strong>
                      <p>{item.action.replaceAll('_',' ')}</p>
                      <small>Prioridad {item.signalPriorityLevel ?? 'N/D'} · {item.signalPriorityScore ?? '—'}/100</small>
                      <small>Régimen {item.marketRegime ?? 'N/D'} · Entry {item.preferredEntry ?? '—'}</small>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {data.allocationPlan ? (
              <section className="panel allocationPanel">
                <div className="portfolioTitle">
                  <div><span className="eyebrow">ASIGNACIÓN MENSUAL</span><h1>Propuesta para USD {formatMoney(data.allocationPlan.capital)}</h1></div>
                  <small>La tesis se calcula en USD; la ejecución local sólo se habilita con CCL, ratio y precio CEDEAR vigentes.</small>
                </div>
                <div className="allocationSummary">
                  <div><span>Asignado</span><b>USD {formatMoney(data.allocationPlan.allocated)}</b></div>
                  <div><span>Reserva</span><b>USD {formatMoney(data.allocationPlan.cashReserve)}</b></div>
                </div>
                <div className="allocationGrid">
                  {data.allocationPlan.items.map((item) => (
                    <article className="allocationCard" key={item.symbol}>
                      <div><b>{item.symbol}</b><strong>{item.allocationPercent.toFixed(1)}%</strong></div>
                      <h2>USD {formatMoney(item.allocationAmount)}</h2>
                      <p>Opportunity {item.opportunityScore}/100 · prioridad {data.opportunities.find((opportunity)=>opportunity.symbol===item.symbol)?.signalPriorityLevel ?? 'N/D'} · peso actual {item.currentWeightPercent.toFixed(1)}%</p>
                      <small>{item.rationale}</small>
                    </article>
                  ))}
                </div>
                {data.allocationPlan.notes.map((note) => <p className="allocationNote" key={note}>• {note}</p>)}
                {data.allocationPlan.items.length ? (
                  <button className="executionButton" onClick={previewExecution} disabled={executionLoading}>
                    {executionLoading ? 'Validando ratios y CCL…' : 'Previsualizar ejecución CEDEAR'}
                  </button>
                ) : null}
                {executionError ? <p className="executionError">{executionError}</p> : null}
              </section>
            ) : null}

            {execution ? (
              <section className="panel executionPanel">
                <div className="portfolioTitle">
                  <div><span className="eyebrow">EJECUCIÓN BYMA</span><h1>Previsualización CEDEAR</h1></div>
                  <small>Conversión máxima admitida: {execution.maxConversionAgeMinutes} min. Esto no envía órdenes.</small>
                </div>
                <div className="executionSummary">
                  <div><span>Listos</span><b>{execution.executableCount}</b></div>
                  <div><span>Bloqueados</span><b>{execution.blockedCount}</b></div>
                  <div><span>Costo estimado</span><b>ARS {formatMoney(execution.estimatedTotalCostArs)}</b></div>
                </div>
                <div className="executionGrid">
                  {execution.items.map((item) => (
                    <article className={`executionCard ${item.executable ? 'executionReady' : 'executionBlocked'}`} key={item.symbol}>
                      <div><b>{item.symbol}</b><span>{item.status}</span></div>
                      {item.plan ? (
                        <>
                          <h2>{item.plan.quantity} CEDEARs</h2>
                          <p>Precio local <b>ARS {formatMoney(item.plan.localPriceArs)}</b></p>
                          <p>Costo <b>ARS {formatMoney(item.plan.estimatedCostArs)}</b></p>
                          <p>Remanente <b>ARS {formatMoney(item.plan.residualArs)}</b></p>
                          <p>CCL <b>{formatMoney(item.plan.cclArsPerUsd)}</b></p>
                          <p>Ratio <b>{item.plan.cedearsPerUnderlyingShare}:1</b></p>
                        </>
                      ) : <p>{item.reason}</p>}
                      {item.reason && item.plan ? <small>{item.reason}</small> : null}
                    </article>
                  ))}
                </div>
                {execution.executableCount > 0 ? (
                  <button className="executionButton" onClick={revalidateExecution} disabled={revalidationLoading}>
                    {revalidationLoading ? 'Revalidando mercado y precio…' : 'Revalidar antes de confirmar'}
                  </button>
                ) : null}
              </section>
            ) : null}

            {revalidation?.results ? (
              <section className="panel executionPanel">
                <div className="portfolioTitle">
                  <div><span className="eyebrow">CONTROL FINAL</span><h1>Revalidación de ejecución</h1></div>
                  <small>READY_TO_CONFIRM no envía una orden; sólo certifica que el plan sigue dentro de tolerancias.</small>
                </div>
                <div className="executionSummary">
                  <div><span>Listos para confirmar</span><b>{revalidation.readyCount ?? 0}</b></div>
                  <div><span>Bloqueados</span><b>{revalidation.blockedCount ?? 0}</b></div>
                </div>
                <div className="executionGrid">
                  {revalidation.results.map((item) => (
                    <article className={`executionCard ${item.readyToConfirm ? 'executionReady' : 'executionBlocked'}`} key={item.symbol}>
                      <div><b>{item.symbol}</b><span>{item.status}</span></div>
                      {item.refreshedPlan ? (
                        <>
                          <h2>{item.refreshedPlan.quantity} CEDEARs</h2>
                          <p>Precio revalidado <b>ARS {formatMoney(item.refreshedPlan.localPriceArs)}</b></p>
                          <p>Costo revalidado <b>ARS {formatMoney(item.refreshedPlan.estimatedCostArs)}</b></p>
                          <p>Drift precio <b>{item.priceDriftPercent?.toFixed(2) ?? '—'}%</b></p>
                          <p>Drift CCL <b>{item.cclDriftPercent?.toFixed(2) ?? '—'}%</b></p>
                        </>
                      ) : null}
                      {item.reason ? <small>{item.reason}</small> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="panel portfolioTablePanel">
              <div className="portfolioTitle">
                <div><span className="eyebrow">RANKING</span><h1>Oportunidades de asignación</h1></div>
                <small>Mayor score = mejor combinación de prioridad de señal, régimen, convicción, portfolio fit, valuación, entrada y concentración.</small>
              </div>
              <div className="portfolioTableWrap">
                <table className="portfolioTable">
                  <thead><tr><th>#</th><th>Ticker</th><th>Acción</th><th>Score</th><th>Prioridad</th><th>Régimen</th><th>Entry</th><th>Peso</th><th>Dist. Entry</th><th>Convicción</th><th>Técnico</th><th>Fund.</th><th>Val.</th><th>Mercado</th></tr></thead>
                  <tbody>
                    {data.opportunities.map((item, index) => (
                      <tr key={item.symbol}>
                        <td>{index + 1}</td>
                        <td><b>{item.symbol}</b><small>{item.currentPrice.toFixed(2)}</small></td>
                        <td><span className={`actionBadge action-${item.action.toLowerCase()}`}>{actionLabel(item.action)}</span></td>
                        <td><strong className="opportunityScore">{item.opportunityScore}</strong></td>
                        <td><b>{item.signalPriorityLevel ?? '—'}</b><small>{item.signalPriorityScore ?? '—'}/100</small></td>
                        <td>{item.marketRegime ?? '—'}<small>{item.contextCoverage ?? '—'}</small></td>
                        <td>{item.preferredEntry ? `Zona ${item.preferredEntry}` : '—'}</td>
                        <td>{item.currentWeightPercent.toFixed(1)}%</td>
                        <td>{item.distanceToEntryPercent === undefined ? '—' : `${item.distanceToEntryPercent > 0 ? '+' : ''}${item.distanceToEntryPercent.toFixed(1)}%`}</td>
                        <td>{item.scores.conviction}</td>
                        <td>{item.scores.technical}</td>
                        <td>{item.scores.fundamental}</td>
                        <td>{item.scores.valuation}</td>
                        <td>{item.scores.market}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {data.opportunities.slice(0, 5).length ? (
              <section className="topOpportunities">
                {data.opportunities.slice(0, 5).map((item) => (
                  <article className="panel opportunityCard" key={item.symbol}>
                    <div><span className="eyebrow">#{data.opportunities.indexOf(item) + 1} · {item.action.replaceAll('_', ' ')}</span><h2>{item.symbol}</h2></div>
                    <strong className="bigScore">{item.opportunityScore}</strong>
                    <p>Precio <b>{item.currentPrice.toFixed(2)}</b> · Peso <b>{item.currentWeightPercent.toFixed(1)}%</b></p>
                    <p>Entry {item.preferredEntry ?? '—'} <b>{item.entryLow !== undefined && item.entryHigh !== undefined ? `${item.entryLow.toFixed(2)}–${item.entryHigh.toFixed(2)}` : '—'}</b></p>
                    <p>Prioridad <b>{item.signalPriorityLevel ?? '—'} {item.signalPriorityScore ?? '—'}/100</b> · Régimen <b>{item.marketRegime ?? '—'}</b></p>
                    <p>Stop <b>{item.stop?.toFixed(2) ?? '—'}</b> · TP1 <b>{item.target?.toFixed(2) ?? '—'}</b></p>
                    <small className="scoreDrivers">{scoreDrivers(item)}</small>
                    {item.thesis[0] ? <p className="cardReason">{item.thesis[0]}</p> : null}
                    {item.risks[0] ? <p className="cardRisk">⚠ {item.risks[0]}</p> : null}
                  </article>
                ))}
              </section>
            ) : null}

            {data.errors.length ? (
              <section className="panel unresolvedPanel">
                <h3>Símbolos no resueltos</h3>
                <p>Se mantienen fuera del ranking hasta agregar el mapping de mercado/exchange correspondiente.</p>
                {data.errors.map((item) => <div key={item.symbol}><b>{item.symbol}</b><span>{item.error}</span></div>)}
              </section>
            ) : null}
          </>
        ) : (
          <section className="panel emptyPortfolio">
            <h1>Ranking mensual de oportunidades</h1>
            <p>Con el bridge IOL configurado, esta pantalla analiza tu cartera real y ordena dónde tendría más sentido agregar capital según la estrategia elegida.</p>
          </section>
        )}
      </section>
    </main>
  );
}
