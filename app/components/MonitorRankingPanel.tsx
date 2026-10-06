'use client';

import { useEffect, useState } from 'react';
import styles from '@/app/components/MonitorRankingPanel.module.css';
import type { TransversalRankingSnapshot } from '@/core/domain/opportunity';

interface Response {
  available: boolean;
  ranking?: TransversalRankingSnapshot | null;
  error?: string;
}

type SourceFilter = 'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'NEW_OPPORTUNITY';

export function MonitorRankingPanel() {
  const [ranking, setRanking] = useState<TransversalRankingSnapshot | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/monitor/ranking', { cache: 'no-store' });
      const payload = await response.json() as Response;
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible cargar el ranking del monitor.');
      setRanking(payload.ranking ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filteredItems = ranking?.items.filter((item) => sourceFilter === 'ALL' || item.source === sourceFilter) ?? [];
  const top = filteredItems.slice(0, 5);
  const capitalIdeas = filteredItems.filter((item) => item.eligibleForNewCapital).slice(0, 5);
  const managementPriorities = ranking?.items
    .filter((item) => !item.eligibleForNewCapital && (item.action === 'REDUCIR' || item.action === 'TOMAR_GANANCIAS' || item.action === 'REVISAR_TESIS'))
    .slice(0, 5) ?? [];
  const firstEligible = capitalIdeas[0];

  function sourceLabel(item: TransversalRankingSnapshot['items'][number]) {
    if (item.source === 'PORTFOLIO') return 'EN CARTERA';
    if (item.source === 'NEW_OPPORTUNITY') return 'NUEVA OPORTUNIDAD';
    return 'WATCHLIST';
  }

  function movementLabel(item: TransversalRankingSnapshot['items'][number]) {
    if (item.movement === 'NEW') return 'NUEVO';
    if (item.movement === 'UNCHANGED' || !item.rankChange) return '—';
    return item.rankChange > 0 ? `↑${item.rankChange}` : `↓${Math.abs(item.rankChange)}`;
  }

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div>
          <span>RANKING VIVO · MONITOR 24/7</span>
          <h1>Prioridad transversal para nuevo capital</h1>
          <p>Consolida los lotes rotativos del monitor y penaliza concentración, régimen adverso y cobertura incompleta.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && !ranking ? (
        <div className={styles.empty}>
          El monitor todavía no acumuló un ranking vigente para la cartera actual. Se completará automáticamente con los próximos ciclos.
        </div>
      ) : null}

      {ranking ? (
        <>
          <div className={styles.summary}>
            <div><span>Cobertura</span><b>{ranking.coveragePercent}%</b><small>{ranking.coveredSymbols}/{ranking.totalSymbols} símbolos</small></div>
            <div>
              <span>#1 nuevo capital</span>
              <b>{firstEligible?.symbol ?? '—'}</b>
              <small>
                {ranking.leaderChange?.changed
                  ? `CAMBIO: ${ranking.leaderChange.previousSymbol ?? '—'} → ${ranking.leaderChange.currentSymbol ?? '—'}`
                  : 'sin cambio de líder'}
              </small>
            </div>
            <div><span>Actualizado</span><b>{new Date(ranking.generatedAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</b><small>{new Date(ranking.generatedAt).toLocaleDateString('es-AR')}</small></div>
          </div>

          <div className={styles.filters}>
            <button type="button" className={sourceFilter === 'ALL' ? styles.activeFilter : ''} onClick={() => setSourceFilter('ALL')}>
              Todos <b>{ranking.items.length}</b>
            </button>
            <button type="button" className={sourceFilter === 'PORTFOLIO' ? styles.activeFilter : ''} onClick={() => setSourceFilter('PORTFOLIO')}>
              En cartera <b>{ranking.sourceCounts?.portfolio ?? ranking.items.filter((item) => item.source === 'PORTFOLIO').length}</b>
            </button>
            <button type="button" className={sourceFilter === 'WATCHLIST' ? styles.activeFilter : ''} onClick={() => setSourceFilter('WATCHLIST')}>
              Watchlist <b>{ranking.sourceCounts?.watchlist ?? ranking.items.filter((item) => item.source === 'WATCHLIST').length}</b>
            </button>
            <button type="button" className={sourceFilter === 'NEW_OPPORTUNITY' ? styles.activeFilter : ''} onClick={() => setSourceFilter('NEW_OPPORTUNITY')}>
              Nuevas <b>{ranking.sourceCounts?.newOpportunities ?? ranking.items.filter((item) => item.source === 'NEW_OPPORTUNITY').length}</b>
            </button>
          </div>

          <div className={styles.sectionTitle}><div><span>NUEVO CAPITAL</span><h2>Mejores candidatos elegibles</h2></div><small>Ordenados por score ajustado, concentración y contexto</small></div>
          <div className={styles.grid}>
            {(capitalIdeas.length ? capitalIdeas : top).map((item) => (
              <article key={item.strategy + '-' + item.symbol} className={styles.card}>
                <div className={styles.rank}>
                  <span>#{item.rank}</span>
                  <em className={
                    item.movement === 'UP' ? styles.up
                      : item.movement === 'DOWN' ? styles.down
                        : item.movement === 'NEW' ? styles.new
                          : styles.flat
                  }>{movementLabel(item)}</em>
                </div>
                <div className={styles.title}><b>{item.symbol}</b><span>{item.strategy.toUpperCase()}</span></div>
                <span className={
                  item.source === 'PORTFOLIO' ? styles.sourcePortfolio
                    : item.source === 'NEW_OPPORTUNITY' ? styles.sourceNew
                      : styles.sourceWatchlist
                }>{sourceLabel(item)}</span>
                <strong>{item.adjustedScore}</strong>
                <p>{item.action.replaceAll('_',' ')}</p>
                <dl>
                  <div><dt>Prioridad</dt><dd>{item.signalPriorityLevel ?? '—'} {item.signalPriorityScore ?? '—'}</dd></div>
                  <div><dt>Régimen</dt><dd>{item.marketRegime ?? '—'}</dd></div>
                  <div><dt>Peso actual</dt><dd>{item.currentWeightPercent.toFixed(1)}%</dd></div>
                  <div><dt>Convicción</dt><dd>{item.conviction}/100</dd></div>
                  <div><dt>Técnico</dt><dd>{item.technicalScore}/100</dd></div>
                  <div><dt>Valuación</dt><dd>{item.valuationScore}/100</dd></div>
                </dl>
                <div className={styles.footer}>
                  <span className={item.eligibleForNewCapital ? styles.eligible : styles.wait}>
                    {item.eligibleForNewCapital ? 'APTO NUEVO CAPITAL' : 'ESPERAR / GESTIONAR'}
                  </span>
                  <span>{item.dataQuality}</span>
                </div>
                {item.notes[0] ? <small className={styles.note}>{item.notes[0]}</small> : null}
              </article>
            ))}
          </div>

          {managementPriorities.length ? <>
            <div className={styles.sectionTitle}><div><span>GESTIÓN DE CARTERA</span><h2>Prioridades de riesgo y toma de ganancias</h2></div><small>No compiten con el ranking de nuevo capital</small></div>
            <div className={styles.managementGrid}>
              {managementPriorities.map((item) => <article key={`mgmt-${item.strategy}-${item.symbol}`} className={styles.managementCard}>
                <div><b>{item.symbol}</b><span>{item.action.replaceAll('_',' ')}</span></div>
                <strong>{item.adjustedScore}</strong>
                <small>{item.signalPriorityLevel ?? '—'} · {item.marketRegime ?? '—'} · peso {item.currentWeightPercent.toFixed(1)}%</small>
                {item.notes[0] ? <p>{item.notes[0]}</p> : null}
              </article>)}
            </div>
          </> : null}

          <div className={styles.disclaimer}>
            <b>Cobertura analítica:</b> el ranking vivo no inventa correlación sectorial ni valoración cuando esos datos no están disponibles en el ciclo del monitor. Para asignación definitiva, usar el análisis completo de cartera.
          </div>
        </>
      ) : null}
    </section>
  );
}
