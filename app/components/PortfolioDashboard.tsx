'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PortfolioOpportunitySummary } from '@/core/domain/opportunity';
import type { Strategy } from '@/core/domain/trading';

interface ApiError {
  error?: string;
}

function actionLabel(action: string) {
  return action.replaceAll('_', ' ');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

export function PortfolioDashboard() {
  const [strategy, setStrategy] = useState<Strategy>('position');
  const [maxSymbols, setMaxSymbols] = useState(25);
  const [data, setData] = useState<PortfolioOpportunitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyzePortfolio() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/portfolio/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, maxSymbols }),
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

  return (
    <main>
      <header className="topbar">
        <strong>MI CARTERA IOL</strong>
        <span>Opportunity ranking · Portfolio fit · Senior Trading Analyst</span>
        <Link className="topLink" href="/">Analizar ticker</Link>
      </header>

      <section className="portfolioShell">
        <div className="panel portfolioControls">
          <div>
            <span className="eyebrow">ESTRATEGIA DE RANKING</span>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
              <option value="position">Position Trading</option>
              <option value="swing">Swing Trading</option>
              <option value="day">Day Trading</option>
            </select>
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
              <div className="panel metricCard"><span>Estrategia</span><strong>{data.strategy.toUpperCase()}</strong></div>
            </div>

            <section className="panel portfolioTablePanel">
              <div className="portfolioTitle">
                <div><span className="eyebrow">RANKING</span><h1>Oportunidades de asignación</h1></div>
                <small>Mayor score = mejor combinación de convicción, portfolio fit, valuación y proximidad a entrada.</small>
              </div>
              <div className="portfolioTableWrap">
                <table className="portfolioTable">
                  <thead><tr><th>#</th><th>Ticker</th><th>Acción</th><th>Score</th><th>Peso</th><th>Dist. Entry</th><th>Convicción</th><th>Técnico</th><th>Fund.</th><th>Val.</th><th>Mercado</th></tr></thead>
                  <tbody>
                    {data.opportunities.map((item, index) => (
                      <tr key={item.symbol}>
                        <td>{index + 1}</td>
                        <td><b>{item.symbol}</b><small>{item.currentPrice.toFixed(2)}</small></td>
                        <td><span className={`actionBadge action-${item.action.toLowerCase()}`}>{actionLabel(item.action)}</span></td>
                        <td><strong className="opportunityScore">{item.opportunityScore}</strong></td>
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
                    <p>Entry A <b>{item.entryLow !== undefined && item.entryHigh !== undefined ? `${item.entryLow.toFixed(2)}–${item.entryHigh.toFixed(2)}` : '—'}</b></p>
                    <p>Stop <b>{item.stop?.toFixed(2) ?? '—'}</b> · TP1 <b>{item.target?.toFixed(2) ?? '—'}</b></p>
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
