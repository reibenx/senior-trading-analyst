'use client';

import { FormEvent, useMemo, useState } from 'react';
import { TechnicalChart } from '@/app/components/TechnicalChart';
import type { FundamentalScore, FundamentalSnapshot } from '@/core/domain/fundamentals';
import type { LineOverlay, OHLCVBar, TechnicalSnapshot, Timeframe, ZoneOverlay } from '@/core/domain/market';
import type { Strategy } from '@/core/domain/trading';
import { calculatePositionSizing } from '@/core/engines/risk';
import { calculateTechnicalScore } from '@/core/engines/technical-score';

interface Props {
  initialBars: OHLCVBar[];
  initialSnapshot: TechnicalSnapshot;
}

interface AnalyzeResponse {
  source: string;
  bars: OHLCVBar[];
  snapshot: TechnicalSnapshot;
  fundamentals?: FundamentalSnapshot | null;
  fundamentalScore?: FundamentalScore | null;
  fundamentalSource?: string | null;
  error?: string;
}

const STRATEGY_TIMEFRAMES: Record<Strategy, Timeframe[]> = {
  day: ['1m', '5m', '15m', '1h'],
  swing: ['1h', '4h', '1d', '1w'],
  position: ['1d', '1w', '1M'],
};

function getLineValue(snapshot: TechnicalSnapshot, id: string): number | undefined {
  const overlay = snapshot.overlays.find(
    (item): item is LineOverlay & { value: number } => item.id === id && item.kind !== 'entry-zone' && typeof item.value === 'number',
  );
  return overlay?.value;
}

function getZoneValue(snapshot: TechnicalSnapshot, id: string): ZoneOverlay | undefined {
  return snapshot.overlays.find((item): item is ZoneOverlay => item.id === id && item.kind === 'entry-zone');
}

function formatRatio(value: number | undefined) {
  return value === undefined ? '—' : value.toFixed(2);
}

function formatPercent(value: number | undefined) {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function AnalysisDashboard({ initialBars, initialSnapshot }: Props) {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const technicalScore = useMemo(() => calculateTechnicalScore(snapshot), [snapshot]);
  const entryA = getZoneValue(snapshot, 'entry-a');
  const entryB = getZoneValue(snapshot, 'entry-b');
  const stop = getLineValue(snapshot, 'stop');
  const tp1 = getLineValue(snapshot, 'tp1');
  const tp2 = getLineValue(snapshot, 'tp2');

  const riskPlan = useMemo(() => {
    const parsedCapital = Number(capital.replace(',', '.'));
    const parsedRisk = Number(risk.replace(',', '.'));
    if (!entryA || stop === undefined) return null;

    return calculatePositionSizing({
      capital: parsedCapital,
      riskPercent: parsedRisk,
      entryPrice: entryA.high,
      stopPrice: stop,
      targetPrice: tp1,
    });
  }, [capital, risk, entryA, stop, tp1]);

  const riskRewardScore = riskPlan?.riskReward === undefined
    ? 0
    : Math.round(Math.max(0, Math.min(100, riskPlan.riskReward * 25)));

  const scores: Array<[string, number | null]> = [
    ['Técnico', technicalScore],
    ['Fundamental', fundamentalScore?.total ?? null],
    ['Valuación', fundamentalScore?.valuation ?? null],
    ['Mercado*', null],
    ['Riesgo / Retorno', riskRewardScore],
    ['Convicción*', null],
  ];

  function onStrategyChange(nextStrategy: Strategy) {
    setStrategy(nextStrategy);
    const allowed = STRATEGY_TIMEFRAMES[nextStrategy];
    if (!allowed.includes(timeframe)) setTimeframe(allowed[0]);
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      setError('Ingresá un ticker válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: cleanSymbol, timeframe }),
      });

      const result = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !result.snapshot || !result.bars) {
        throw new Error(result.error ?? 'No fue posible analizar el ticker.');
      }

      setSymbol(cleanSymbol);
      setBars(result.bars);
      setSnapshot(result.snapshot);
      setSource(result.source);
      setFundamentals(result.fundamentals ?? null);
      setFundamentalScore(result.fundamentalScore ?? null);
      setFundamentalSource(result.fundamentalSource ?? null);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Error inesperado al analizar el ticker.');
    } finally {
      setLoading(false);
    }
  }

  const decision = snapshot.trend === 'BULL' ? 'MANTENER' : snapshot.trend === 'BEAR' ? 'REDUCIR / ESPERAR' : 'ESPERAR';
  const subDecision = snapshot.trend === 'BULL' ? 'Aumentar en pullback' : snapshot.trend === 'BEAR' ? 'Evitar nuevas entradas' : 'Esperar confirmación';

  return (
    <main>
      <header className="topbar">
        <strong>SENIOR TRADING ANALYST</strong>
        <span>Market intelligence · Portfolio · Risk · Monitoring 24/7</span>
        <em>ALPHA PREVIEW</em>
      </header>

      <section className="shell">
        <aside className="panel controls">
          <h2>Configurar análisis</h2>
          <form onSubmit={handleAnalyze}>
            <label>Ticker<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={20} /></label>
            <label>Estrategia<select value={strategy} onChange={(event) => onStrategyChange(event.target.value as Strategy)}><option value="day">Day Trading</option><option value="swing">Swing Trading</option><option value="position">Position Trading</option></select></label>
            <label>Timeframe<select value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>{STRATEGY_TIMEFRAMES[strategy].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
            <label>Capital disponible (USD)<input inputMode="decimal" value={capital} onChange={(event) => setCapital(event.target.value)} /></label>
            <label>Riesgo máximo (%)<input inputMode="decimal" value={risk} onChange={(event) => setRisk(event.target.value)} /></label>
            <button type="submit" disabled={loading}>{loading ? 'Analizando…' : 'Analizar'}</button>
            {error ? <p className="formError" role="alert">{error}</p> : null}
          </form>

          <div className="status"><b>Market Data</b><span>{source === 'demo-fixture' ? 'DEMO OHLCV · configurar TWELVE_DATA_API_KEY' : source}</span></div>
          <div className="status"><b>Fundamentales</b><span>{fundamentalSource ?? 'Configurar ALPHA_VANTAGE_API_KEY'}</span></div>
          <div className="status"><b>IOL Portfolio</b><span>Puente seguro pendiente</span></div>
          <div className="status"><b>Monitoring Agent</b><span>Arquitectura 24/7 preparada</span></div>
        </aside>

        <section className="workspace">
          <div className="panel chart liveChart">
            <div className="chartHead"><div><b>{snapshot.symbol}</b><small> {strategy.toUpperCase()} · {snapshot.timeframe.toUpperCase()}</small></div><span>Vista técnica · {source === 'demo-fixture' ? 'datos DEMO' : source}</span></div>
            <TechnicalChart bars={bars} snapshot={snapshot} />
          </div>

          <div className="scoreGrid">
            {scores.map(([name, value]) => <div className="panel score" key={name}><span>{name}</span><strong>{value ?? '—'}</strong></div>)}
          </div>
        </section>

        <aside className="panel decision">
          <span className="eyebrow">DECISIÓN {source === 'demo-fixture' ? 'DEMO' : ''}</span>
          <h1>{decision}</h1><h3>{subDecision}</h3>
          <div className="conviction"><span>Técnico</span><b>{technicalScore}/100</b></div>

          <hr /><h3>Plan técnico automático</h3>
          <p>Entry A <b>{entryA ? `$${entryA.low.toFixed(2)}–$${entryA.high.toFixed(2)}` : '—'}</b></p>
          <p>Entry B <b>{entryB ? `$${entryB.low.toFixed(2)}–$${entryB.high.toFixed(2)}` : '—'}</b></p>
          <p>Stop <b>{stop !== undefined ? `$${stop.toFixed(2)}` : '—'}</b></p><p>TP1 <b>{tp1 !== undefined ? `$${tp1.toFixed(2)}` : '—'}</b></p><p>TP2 <b>{tp2 !== undefined ? `$${tp2.toFixed(2)}` : '—'}</b></p>

          <hr /><h3>Diagnóstico técnico</h3>
          <p>Tendencia <b>{snapshot.trend}</b> · estructura <b>{snapshot.structure}</b>.</p>
          <p>EMA20 <b>{snapshot.ema20 ?? '—'}</b> · EMA50 <b>{snapshot.ema50 ?? '—'}</b> · EMA200 <b>{snapshot.ema200 ?? '—'}</b>.</p>
          <p>RSI14 <b>{snapshot.rsi14 ?? '—'}</b> · ATR14 <b>{snapshot.atr14 ?? '—'}</b>.</p>

          <hr /><h3>Fundamentales</h3>
          {fundamentals && fundamentalScore ? (
            <>
              <p>{fundamentals.name ?? fundamentals.symbol} <b>{fundamentals.sector ?? ''}</b></p>
              <p>Quality <b>{fundamentalScore.quality}/100</b> · Growth <b>{fundamentalScore.growth}/100</b></p>
              <p>Forward P/E <b>{formatRatio(fundamentals.forwardPE)}</b> · PEG <b>{formatRatio(fundamentals.pegRatio)}</b></p>
              <p>ROE <b>{formatPercent(fundamentals.returnOnEquity)}</b> · margen neto <b>{formatPercent(fundamentals.profitMargin)}</b></p>
              <p>Revenue YoY <b>{formatPercent(fundamentals.revenueGrowthYoY)}</b> · EPS YoY <b>{formatPercent(fundamentals.earningsGrowthYoY)}</b></p>
            </>
          ) : <p>Sin proveedor fundamental configurado; no se inventan scores.</p>}

          <hr /><h3>Gestión de riesgo</h3>
          {riskPlan ? <><p>Presupuesto de riesgo <b>USD {riskPlan.riskBudget.toFixed(2)}</b></p><p>Riesgo por unidad <b>USD {riskPlan.riskPerUnit.toFixed(2)}</b></p><p>Tamaño máximo <b>{riskPlan.quantity} unidades</b></p><p>Capital utilizado <b>USD {riskPlan.positionValue.toFixed(2)} ({riskPlan.capitalUtilizationPercent}%)</b></p><p>R/R a TP1 <b>{riskPlan.riskReward !== undefined ? `1:${riskPlan.riskReward.toFixed(2)}` : '—'}</b></p></> : <p>Ingresá capital y riesgo válidos para calcular position sizing.</p>}

          <hr /><h3>Qué invalida la tesis</h3><p>Ruptura estructural, pérdida del stop técnico, deterioro fundamental o cambio relevante del régimen de mercado.</p>
          <p><small>* Mercado y Convicción se activarán cuando conectemos contexto macro/sector y el Decision Engine completo.</small></p>
        </aside>
      </section>
    </main>
  );
}
