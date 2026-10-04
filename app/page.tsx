import { TechnicalChart } from '@/app/components/TechnicalChart';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { createDemoBars } from '@/core/fixtures/demo-market';
import type { LineOverlay, ZoneOverlay } from '@/core/domain/market';

const bars = createDemoBars();
const snapshot = buildTechnicalSnapshot({ symbol: 'NVDA', timeframe: '1d', bars });

function lineValue(id: string): number | undefined {
  const overlay = snapshot.overlays.find((item): item is LineOverlay => item.id === id && 'value' in item);
  return overlay?.value;
}

function zoneValue(id: string): ZoneOverlay | undefined {
  return snapshot.overlays.find((item): item is ZoneOverlay => item.id === id && item.kind === 'entry-zone');
}

const entryA = zoneValue('entry-a');
const entryB = zoneValue('entry-b');
const stop = lineValue('stop');
const tp1 = lineValue('tp1');
const tp2 = lineValue('tp2');
const technicalScore = Math.round(
  (snapshot.trend === 'BULL' ? 36 : snapshot.trend === 'NEUTRAL' ? 22 : 8) +
  (snapshot.structure === 'HH_HL' ? 24 : snapshot.structure === 'RANGE' ? 14 : 5) +
  (snapshot.rsi14 && snapshot.rsi14 >= 40 && snapshot.rsi14 <= 68 ? 20 : 10) +
  (snapshot.currentPrice > (snapshot.ema50 ?? snapshot.currentPrice) ? 20 : 8),
);

const scores = [
  ['Técnico', technicalScore],
  ['Fundamental', 89],
  ['Valuación', 68],
  ['Mercado', 81],
  ['Riesgo / Retorno', 77],
  ['Convicción', 84],
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <strong>SENIOR TRADING ANALYST</strong>
        <span>Market intelligence · Portfolio · Risk · Monitoring 24/7</span>
        <em>TECH PREVIEW</em>
      </header>

      <section className="shell">
        <aside className="panel controls">
          <h2>Configurar análisis</h2>
          <label>Ticker<input defaultValue="NVDA" /></label>
          <label>Estrategia<select defaultValue="swing"><option value="day">Day Trading</option><option value="swing">Swing Trading</option><option value="position">Position Trading</option></select></label>
          <label>Capital disponible<input defaultValue="5000" /></label>
          <label>Riesgo máximo<input defaultValue="1.0%" /></label>
          <button>Analizar</button>

          <div className="status"><b>Market Data</b><span>Fixture OHLCV · adapter listo para proveedor real</span></div>
          <div className="status"><b>IOL Portfolio</b><span>BrokerAdapter preparado</span></div>
          <div className="status"><b>Monitoring Agent</b><span>Arquitectura 24/7 preparada</span></div>
        </aside>

        <section className="workspace">
          <div className="panel chart liveChart">
            <div className="chartHead">
              <div><b>{snapshot.symbol}</b><small> Swing · {snapshot.timeframe.toUpperCase()}</small></div>
              <span>Vista técnica · datos DEMO determinísticos</span>
            </div>
            <TechnicalChart bars={bars} snapshot={snapshot} />
          </div>

          <div className="scoreGrid">
            {scores.map(([name, value]) => <div className="panel score" key={name}><span>{name}</span><strong>{value}</strong></div>)}
          </div>
        </section>

        <aside className="panel decision">
          <span className="eyebrow">DECISIÓN DEMO</span>
          <h1>{snapshot.trend === 'BULL' ? 'MANTENER' : 'ESPERAR'}</h1>
          <h3>{snapshot.trend === 'BULL' ? 'Aumentar en pullback' : 'Esperar confirmación'}</h3>
          <div className="conviction"><span>Técnico</span><b>{technicalScore}/100</b></div>

          <hr />
          <h3>Plan técnico automático</h3>
          <p>Entry A <b>{entryA ? `$${entryA.low.toFixed(2)}–$${entryA.high.toFixed(2)}` : '—'}</b></p>
          <p>Entry B <b>{entryB ? `$${entryB.low.toFixed(2)}–$${entryB.high.toFixed(2)}` : '—'}</b></p>
          <p>Stop <b>{stop ? `$${stop.toFixed(2)}` : '—'}</b></p>
          <p>TP1 <b>{tp1 ? `$${tp1.toFixed(2)}` : '—'}</b></p>
          <p>TP2 <b>{tp2 ? `$${tp2.toFixed(2)}` : '—'}</b></p>

          <hr />
          <h3>Diagnóstico</h3>
          <p>Tendencia <b>{snapshot.trend}</b> · estructura <b>{snapshot.structure}</b>.</p>
          <p>EMA20 <b>{snapshot.ema20 ?? '—'}</b> · EMA50 <b>{snapshot.ema50 ?? '—'}</b> · EMA200 <b>{snapshot.ema200 ?? '—'}</b>.</p>
          <p>RSI14 <b>{snapshot.rsi14 ?? '—'}</b> · ATR14 <b>{snapshot.atr14 ?? '—'}</b>.</p>

          <hr />
          <h3>Qué invalida la tesis</h3>
          <p>Ruptura estructural, pérdida del stop técnico, deterioro fundamental o cambio relevante del régimen de mercado.</p>

          <hr />
          <h3>Próxima conexión</h3>
          <p>Proveedor OHLCV real → IOL → fundamentales → alertas Telegram/WhatsApp.</p>
        </aside>
      </section>
    </main>
  );
}
