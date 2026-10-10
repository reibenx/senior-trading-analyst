'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Position } from '@/core/domain/trading';
import type { TransversalRankingSnapshot } from '@/core/domain/opportunity';
import { listThesis2027Profiles } from '@/core/engines/thesis-2027';

type PortfolioResponse = {
  connected: boolean;
  positions: Position[];
  error?: string;
};

type RankingResponse = {
  available: boolean;
  ranking?: TransversalRankingSnapshot | null;
  error?: string;
};

const STANCE_LABEL: Record<string, string> = {
  PRIORITY_ACCUMULATE: 'PRIORIDAD DE ACUMULACIÓN',
  ACCUMULATE_WATCH: 'ACUMULAR CON VIGILANCIA',
  HOLD: 'MANTENER',
  DO_NOT_ADD: 'NO INCREMENTAR',
  NEUTRAL: 'NEUTRAL',
};

const THEME_LABEL: Record<string, string> = {
  AI_INFRASTRUCTURE: 'AI Infrastructure',
  HYPERSCALERS: 'Hyperscalers',
  POWER: 'Power / Data Centers',
  DIGITAL_ASSETS: 'Digital Assets',
  AI_SOFTWARE: 'AI Software',
  OTHER: 'Otros',
};

export function Thesis2027Dashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [ranking, setRanking] = useState<TransversalRankingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [portfolioResponse, rankingResponse] = await Promise.all([
        fetch('/api/portfolio', { cache: 'no-store' }),
        fetch('/api/monitor/ranking', { cache: 'no-store' }),
      ]);
      const portfolio = await portfolioResponse.json() as PortfolioResponse;
      const rank = await rankingResponse.json() as RankingResponse;
      setPositions(portfolio.positions ?? []);
      setRanking(rank.ranking ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const profiles = useMemo(() => listThesis2027Profiles(), []);
  const portfolioValue = positions.reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);

  const rows = profiles.map((profile) => {
    const holdingValue = positions
      .filter((position) => position.symbol.toUpperCase() === profile.symbol)
      .reduce((sum, position) => sum + Math.max(0, position.marketValue ?? 0), 0);
    const weight = portfolioValue > 0 ? (holdingValue / portfolioValue) * 100 : 0;
    const rank = ranking?.items.find((item) => item.symbol === profile.symbol);
    return { profile, holdingValue, weight, rank };
  });

  const themeExposure = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      for (const theme of row.profile.themes) {
        acc[theme] = (acc[theme] ?? 0) + row.holdingValue;
      }
      return acc;
    }, {}),
  )
    .map(([theme, value]) => ({
      theme,
      value,
      weight: portfolioValue > 0 ? (value / portfolioValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <main>
      <header className="topbar">
        <strong>TESIS 2027</strong>
        <span>AI Infrastructure · Power · Digital Assets</span>
        <button className="thesisRefresh" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      <section className="thesisShell">
        <section className="panel thesisHero">
          <div>
            <span className="eyebrow">CAPA ESTRATÉGICA</span>
            <h1>Tesis de cartera 2027</h1>
            <p>
              Convierte la visión estructural de mediano plazo en un overlay del Senior Trading Analyst:
              el ranking táctico sigue mandando en timing, pero la tesis modifica prioridad y puede bloquear nuevo capital.
            </p>
          </div>
          <div className="thesisRule">
            <span>REGLA DE FUSIÓN</span>
            <b>Táctica + Estrategia + Portfolio Fit</b>
            <small>Máximo ajuste estratégico: +8 / -8 puntos.</small>
          </div>
        </section>

        <section className="thesisThemeGrid">
          {themeExposure.map((item) => (
            <article className="panel thesisThemeCard" key={item.theme}>
              <span>{THEME_LABEL[item.theme] ?? item.theme}</span>
              <strong>{item.weight.toFixed(1)}%</strong>
              <small>peso actual estimado de cartera</small>
            </article>
          ))}
        </section>

        <section className="panel thesisTablePanel">
          <div className="portfolioTitle">
            <div>
              <span className="eyebrow">MAPA ESTRATÉGICO</span>
              <h1>Postura 2027 por activo</h1>
            </div>
            <small>El score ajustado mostrado abajo ya incorpora la capa estratégica cuando existe ranking vigente.</small>
          </div>

          <div className="portfolioTableWrap">
            <table className="portfolioTable thesisTable">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Tema</th>
                  <th>Postura 2027</th>
                  <th>Ajuste</th>
                  <th>Peso cartera</th>
                  <th>Ranking actual</th>
                  <th>Score ajustado</th>
                  <th>Estado evidencia</th>
                  <th>Dinámico</th>
                  <th>Eventos</th>
                  <th>Próx. earnings</th>
                  <th>Acción táctica</th>
                  <th>Racional</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ profile, weight, rank }) => (
                  <tr key={profile.symbol}>
                    <td><b>{profile.symbol}</b></td>
                    <td>{profile.themes.map((theme) => THEME_LABEL[theme] ?? theme).join(' · ')}</td>
                    <td><span className={`thesisStance thesis-${profile.stance.toLowerCase()}`}>{STANCE_LABEL[profile.stance]}</span></td>
                    <td className={profile.strategicAdjustment > 0 ? 'thesisPositive' : profile.strategicAdjustment < 0 ? 'thesisNegative' : ''}>
                      {profile.strategicAdjustment > 0 ? '+' : ''}{profile.strategicAdjustment}
                    </td>
                    <td>{weight > 0 ? `${weight.toFixed(1)}%` : '—'}</td>
                    <td>{rank ? `#${rank.rank}` : '—'}</td>
                    <td>{rank?.adjustedScore ?? '—'}</td>
                    <td>
                      {rank?.thesis2027EvidenceStatus ? (
                        <span className={`thesisEvidence thesis-evidence-${rank.thesis2027EvidenceStatus.toLowerCase()}`}>
                          {rank.thesis2027EvidenceStatus}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {rank?.thesis2027DynamicAdjustment !== undefined
                        ? `${rank.thesis2027DynamicAdjustment > 0 ? '+' : ''}${rank.thesis2027DynamicAdjustment}`
                        : '—'}
                    </td>
                    <td>
                      {rank?.thesis2027EventStatus ? (
                        <span className={`thesisEvent thesis-event-${rank.thesis2027EventStatus.toLowerCase()}`}>
                          {rank.thesis2027EventStatus}
                          {rank.thesis2027EventAdjustment ? ` ${rank.thesis2027EventAdjustment > 0 ? '+' : ''}${rank.thesis2027EventAdjustment}` : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{rank?.thesis2027UpcomingEarningsDate ?? '—'}</td>
                    <td>{rank?.action?.replaceAll('_', ' ') ?? '—'}</td>
                    <td>
                      {profile.rationale}
                      {rank?.thesis2027EvidenceReasons?.[0] ? ` · ${rank.thesis2027EvidenceReasons[0]}` : ''}
                      {rank?.thesis2027Catalysts?.[0] ? ` · Catalizador: ${rank.thesis2027Catalysts[0]}` : ''}
                      {rank?.thesis2027EventRisks?.[0] ? ` · Riesgo evento: ${rank.thesis2027EventRisks[0]}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel thesisMonitor">
          <span className="eyebrow">QUÉ DEBE VALIDAR EL AGENTE</span>
          <div className="thesisMonitorGrid">
            <article><b>Fundamentales</b><span>Ingresos, EPS, FCF, márgenes, guidance y revisiones.</span></article>
            <article><b>Capex IA</b><span>Capex de hyperscalers y monetización de infraestructura.</span></article>
            <article><b>Semis / Storage</b><span>Demanda, capacidad, pricing, inventarios y ciclo.</span></article>
            <article><b>Power</b><span>Demanda eléctrica de data centers, contratos y capacidad.</span></article>
            <article><b>Digital Assets</b><span>Liquidez, adopción, flujos y riesgo de régimen.</span></article>
            <article><b>Valuación</b><span>Forward P/E, PEG, EV/EBITDA, P/FCF y margen de seguridad.</span></article>
          </div>
        </section>
      </section>
    </main>
  );
}
