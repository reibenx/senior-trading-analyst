import Link from 'next/link';
import { MonitorRankingPanel } from '@/app/components/MonitorRankingPanel';

export default function OpportunitiesPage() {
  return (
    <main>
      <header className="topbar">
        <strong>OPORTUNIDADES</strong>
        <span>Descubrimiento · ranking vivo · capital marginal</span>
        <Link className="topLink" href="/portfolio">Ver Cartera IOL</Link>
      </header>
      <section className="opportunitiesShell">
        <section className="opportunityHero panel">
          <div>
            <span className="eyebrow">CAPITAL MARGINAL</span>
            <h1>Dónde merece ir el próximo aporte</h1>
            <p>Esta vista compara candidatos por calidad relativa. La gestión de posiciones existentes permanece en Cartera IOL.</p>
          </div>
          <div className="opportunityScope">
            <span>UNIVERSO</span>
            <b>Cartera + watchlist + monitor</b>
            <small>El ranking se actualiza con los ciclos del agente.</small>
          </div>
        </section>
        <MonitorRankingPanel />
      </section>
    </main>
  );
}
