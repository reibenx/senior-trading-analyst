'use client';

import { useState } from 'react';
import { TechnicalChart } from '@/app/components/TechnicalChart';
import type { OHLCVBar, TechnicalSnapshot } from '@/core/domain/market';

const BENCHMARKS = [
  ['SPY', 'S&P 500'],
  ['QQQ', 'Nasdaq 100'],
  ['XLK', 'Tecnología'],
  ['XLF', 'Financieras'],
  ['XLV', 'Salud'],
  ['XLE', 'Energía'],
  ['XLI', 'Industriales'],
  ['XLP', 'Consumo defensivo'],
  ['XLY', 'Consumo discrecional'],
] as const;

type MarketResponse = {
  source?: string;
  symbol?: string;
  snapshot?: TechnicalSnapshot;
  bars?: OHLCVBar[];
  error?: string;
};

function biasLabel(snapshot?: TechnicalSnapshot) {
  if (!snapshot) return 'Sin lectura';
  if (snapshot.trend === 'BULL' && snapshot.structure === 'HH_HL') return 'Alcista confirmado';
  if (snapshot.trend === 'BEAR' && snapshot.structure === 'LH_LL') return 'Bajista confirmado';
  if (snapshot.trend === 'BULL') return 'Sesgo alcista';
  if (snapshot.trend === 'BEAR') return 'Sesgo bajista';
  return 'Neutral / rango';
}

export function MarketDashboard() {
  const [symbol, setSymbol] = useState('SPY');
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [snapshot, setSnapshot] = useState<TechnicalSnapshot | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextSymbol = symbol) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/market/benchmark?symbol=${encodeURIComponent(nextSymbol)}`, { cache: 'no-store' });
      const data = await response.json() as MarketResponse;
      if (!response.ok || !data.snapshot || !data.bars) throw new Error(data.error ?? 'No fue posible cargar el mercado.');
      setSymbol(nextSymbol);
      setSnapshot(data.snapshot);
      setBars(data.bars);
      setSource(data.source ?? null);
    } catch (marketError) {
      setError(marketError instanceof Error ? marketError.message : 'Error de mercado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="marketPage portfolioShell">
      <section className="panel marketHero">
        <div>
          <span className="eyebrow">MERCADO</span>
          <h1>Contexto técnico de benchmarks</h1>
          <p>Consulta individual para respetar el cupo de datos. No se cargan múltiples índices en paralelo.</p>
        </div>
        <button onClick={() => load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar mercado'}</button>
      </section>

      <section className="panel marketSelector">
        {BENCHMARKS.map(([ticker, label]) => (
          <button
            key={ticker}
            className={symbol === ticker ? 'active' : ''}
            onClick={() => { setSymbol(ticker); void load(ticker); }}
            disabled={loading}
          >
            <b>{ticker}</b><span>{label}</span>
          </button>
        ))}
      </section>

      {error ? <section className="panel portfolioError">{error}</section> : null}

      <section className="marketOverviewGrid">
        <div className="panel marketChartPanel">
          {snapshot && bars.length ? <TechnicalChart bars={bars} snapshot={snapshot} /> : <div className="marketEmpty"><b>Seleccioná un benchmark</b><span>Presioná “Actualizar mercado” para cargar datos reales.</span></div>}
        </div>
        <aside className="panel marketReadPanel">
          <span className="eyebrow">LECTURA ACTUAL</span>
          <h2>{snapshot?.symbol ?? symbol}</h2>
          <strong>{biasLabel(snapshot ?? undefined)}</strong>
          <dl>
            <div><dt>Precio</dt><dd>{snapshot ? snapshot.currentPrice.toFixed(2) : '—'}</dd></div>
            <div><dt>EMA 9</dt><dd>{snapshot?.ema9?.toFixed(2) ?? '—'}</dd></div>
            <div><dt>EMA 21</dt><dd>{snapshot?.ema21?.toFixed(2) ?? '—'}</dd></div>
            <div><dt>EMA 50</dt><dd>{snapshot?.ema50?.toFixed(2) ?? '—'}</dd></div>
            <div><dt>EMA 200</dt><dd>{snapshot?.ema200?.toFixed(2) ?? '—'}</dd></div>
            <div><dt>RSI 14</dt><dd>{snapshot?.rsi14 ?? '—'}</dd></div>
            <div><dt>ATR 14</dt><dd>{snapshot?.atr14 ?? '—'}</dd></div>
            <div><dt>Estructura</dt><dd>{snapshot?.structure ?? '—'}</dd></div>
          </dl>
          <small>Fuente: {source ?? 'pendiente'} · timeframe 1D</small>
        </aside>
      </section>
    </main>
  );
}
