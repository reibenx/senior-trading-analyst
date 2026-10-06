'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PortfolioOpportunitySummary } from '@/core/domain/opportunity';
import type { Position, Strategy } from '@/core/domain/trading';

interface PortfolioResponse {
  connected: boolean;
  broker: string | null;
  positions: Position[];
  error?: string;
  message?: string;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function managementLabel(action?: string) {
  if (!action) return 'SIN EVALUAR';
  return action.replaceAll('_', ' ');
}

export function PortfolioManagerDashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [analysis, setAnalysis] = useState<PortfolioOpportunitySummary | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('position');
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPortfolio() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/portfolio', { cache: 'no-store' });
      const payload = await response.json() as PortfolioResponse;
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible cargar la cartera IOL.');
      setPortfolio(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function evaluateManagement() {
    setAnalysisLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/portfolio/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          maxSymbols: 50,
        }),
      });
      const payload = await response.json() as PortfolioOpportunitySummary & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible evaluar la gestión de cartera.');
      setAnalysis(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setAnalysisLoading(false);
    }
  }

  useEffect(() => { void loadPortfolio(); }, []);

  const positions = portfolio?.positions.filter((position) => position.quantity > 0) ?? [];
  const totalValue = positions.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);

  const rows = useMemo(() => positions
    .map((position) => {
      const marketValue = Math.max(0, position.marketValue ?? 0);
      const weight = totalValue > 0 ? (marketValue / totalValue) * 100 : 0;
      const management = analysis?.opportunities.find(
        (item) => item.symbol.toUpperCase() === position.symbol.toUpperCase(),
      );
      return { position, marketValue, weight, management };
    })
    .sort((a, b) => b.marketValue - a.marketValue), [positions, totalValue, analysis]);

  const largest = rows[0];
  const concentration = rows.filter((row) => row.weight >= 10).reduce((sum, row) => sum + row.weight, 0);
  const managementPriorities = rows.filter(({ management }) =>
    management && ['REDUCIR', 'TOMAR_GANANCIAS', 'REVISAR_TESIS'].includes(management.action),
  );

  return (
    <main>
      <header className="topbar">
        <strong>CARTERA IOL</strong>
        <span>Estado patrimonial · concentración · gestión de posiciones existentes</span>
        <Link className="topLink" href="/opportunities">Buscar oportunidades</Link>
      </header>

      <section className="portfolioShell">
        <section className="portfolioHero panel">
          <div>
            <span className="eyebrow">PORTFOLIO MANAGER</span>
            <h1>Qué tengo, cuánto pesa y qué debo gestionar</h1>
            <p>Esta vista administra posiciones existentes. El ranking de capital nuevo vive en Oportunidades.</p>
          </div>
          <div className="portfolioHeroActions">
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
              <option value="position">Position Trading</option>
              <option value="swing">Swing Trading</option>
              <option value="day">Day Trading</option>
            </select>
            <button type="button" onClick={evaluateManagement} disabled={analysisLoading || !positions.length}>
              {analysisLoading ? 'Evaluando…' : 'Evaluar riesgo y gestión'}
            </button>
            <button type="button" className="secondaryButton" onClick={loadPortfolio} disabled={loading}>
              {loading ? 'Actualizando…' : 'Actualizar IOL'}
            </button>
          </div>
        </section>

        {error ? <div className="panel portfolioError">{error}</div> : null}

        <div className="portfolioSummary">
          <div className="panel metricCard"><span>Valor cartera</span><strong>{formatMoney(totalValue)}</strong><small>según bridge IOL</small></div>
          <div className="panel metricCard"><span>Posiciones</span><strong>{rows.length}</strong><small>activos con tenencia</small></div>
          <div className="panel metricCard"><span>Mayor posición</span><strong>{largest?.position.symbol ?? '—'}</strong><small>{largest ? `${largest.weight.toFixed(1)}% de la cartera` : 'sin posiciones'}</small></div>
          <div className="panel metricCard"><span>Concentración ≥10%</span><strong>{concentration.toFixed(1)}%</strong><small>peso acumulado en posiciones grandes</small></div>
        </div>

        {managementPriorities.length ? (
          <section className="panel managementFocus">
            <div className="portfolioTitle">
              <div>
                <span className="eyebrow">ATENCIÓN DE CARTERA</span>
                <h1>Posiciones que requieren gestión</h1>
              </div>
              <small>Estas señales no compiten por capital nuevo: indican qué revisar dentro de la cartera actual.</small>
            </div>
            <div className="managementFocusGrid">
              {managementPriorities.map(({ position, management, weight }) => (
                <article key={position.symbol}>
                  <div><b>{position.symbol}</b><span>{managementLabel(management?.action)}</span></div>
                  <strong>{management?.opportunityScore ?? '—'}</strong>
                  <p>Peso actual {weight.toFixed(1)}% · convicción {management?.scores.conviction ?? '—'}/100</p>
                  {management?.risks[0] ? <small>{management.risks[0]}</small> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel portfolioTablePanel">
          <div className="portfolioTitle">
            <div>
              <span className="eyebrow">POSICIONES REALES</span>
              <h1>Cartera conectada a IOL</h1>
            </div>
            <small>{portfolio?.connected ? `Broker: ${portfolio.broker ?? 'IOL'}` : 'Bridge no disponible'}</small>
          </div>
          <div className="portfolioTableWrap">
            <table className="portfolioTable portfolioManagementTable">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Cantidad</th>
                  <th>Valor</th>
                  <th>Peso</th>
                  <th>Precio prom.</th>
                  <th>Mercado</th>
                  <th>Tipo</th>
                  <th>Gestión</th>
                  <th>Convicción</th>
                  <th>Riesgo / tesis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ position, marketValue, weight, management }) => (
                  <tr key={position.symbol}>
                    <td><b>{position.symbol}</b><small>{position.currency}</small></td>
                    <td>{position.quantity}</td>
                    <td>{formatMoney(marketValue)}</td>
                    <td><strong className={weight >= 15 ? 'weightHigh' : weight >= 10 ? 'weightWatch' : ''}>{weight.toFixed(1)}%</strong></td>
                    <td>{position.averagePrice !== undefined ? formatMoney(position.averagePrice) : '—'}</td>
                    <td>{position.market ?? '—'}</td>
                    <td>{position.assetType ?? '—'}</td>
                    <td><span className={`actionBadge action-${management?.action?.toLowerCase() ?? 'pending'}`}>{managementLabel(management?.action)}</span></td>
                    <td>{management?.scores.conviction ?? '—'}</td>
                    <td>
                      <small>{management?.risks[0] ?? management?.thesis[0] ?? 'Ejecutá “Evaluar riesgo y gestión” para obtener lectura analítica.'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!loading && !rows.length ? (
          <section className="panel emptyPortfolio">
            <h1>No hay posiciones disponibles</h1>
            <p>La vista Cartera IOL se completará cuando el bridge devuelva tenencias activas.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
