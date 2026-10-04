'use client';

import { useState } from 'react';
import type { LineOverlay, OHLCVBar, TechnicalSnapshot, ZoneOverlay } from '@/core/domain/market';

interface Props {
  bars: OHLCVBar[];
  snapshot: TechnicalSnapshot;
}

type PricedLineOverlay = LineOverlay & { value: number };
type SegmentLineOverlay = LineOverlay & { from: { time: string; value: number }; to: { time: string; value: number } };
type VolumeProfileBin = { low: number; high: number; total: number; up: number; down: number };
type IndicatorKey = 'ema' | 'profile' | 'rsi' | 'macd' | 'volume';

const W = 920;
const PRICE_H = 390;
const RSI_H = 92;
const MACD_H = 112;
const VOL_H = 70;
const GAP = 12;
const H = PRICE_H + RSI_H + MACD_H + VOL_H + GAP * 3;
const PAD_X = 44;
const PAD_Y = 22;
const PROFILE_MAX_W = 118;
const PROFILE_BINS = 18;

const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  ema: 'EMA',
  profile: 'Profile',
  rsi: 'RSI',
  macd: 'MACD',
  volume: 'Volumen',
};

function isPricedLineOverlay(overlay: TechnicalSnapshot['overlays'][number]): overlay is PricedLineOverlay {
  return overlay.kind !== 'entry-zone' && typeof overlay.value === 'number';
}

function isSegmentLineOverlay(overlay: TechnicalSnapshot['overlays'][number]): overlay is SegmentLineOverlay {
  return overlay.kind !== 'entry-zone' && Boolean(overlay.from && overlay.to);
}

function emaSeries(values: number[], period: number) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let index = 1; index < values.length; index += 1) out.push(values[index] * k + out[index - 1] * (1 - k));
  return out;
}

function rsiSeries(values: number[], period = 14) {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    out[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}

function pathFrom(values: Array<number | null>, x: (index: number) => number, y: (value: number) => number) {
  let path = '';
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    path += `${path ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
  });
  return path;
}

function buildVolumeProfile(bars: OHLCVBar[], min: number, max: number, binsCount = PROFILE_BINS): VolumeProfileBin[] {
  const range = Math.max(0.000001, max - min);
  const step = range / binsCount;
  const bins = Array.from({ length: binsCount }, (_, index) => ({
    low: min + index * step,
    high: min + (index + 1) * step,
    total: 0,
    up: 0,
    down: 0,
  }));

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const rawIndex = Math.floor(((typicalPrice - min) / range) * binsCount);
    const index = Math.max(0, Math.min(binsCount - 1, rawIndex));
    const volume = Number.isFinite(bar.volume) ? Math.max(0, bar.volume) : 0;
    bins[index].total += volume;
    if (bar.close >= bar.open) bins[index].up += volume;
    else bins[index].down += volume;
  }
  return bins;
}

function overlayClassName(line: PricedLineOverlay) {
  return `overlayLine ${line.kind} ${line.id}`;
}

export function TechnicalChart({ bars, snapshot }: Props) {
  const [indicators, setIndicators] = useState<Record<IndicatorKey, boolean>>({
    ema: true,
    profile: true,
    rsi: true,
    macd: true,
    volume: true,
  });

  const visible = bars.slice(-80);
  const firstVisibleIndex = Math.max(0, bars.length - visible.length);
  const closes = visible.map((bar) => bar.close);
  const rsi = rsiSeries(closes);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = closes.map((_, index) => ema12[index] - ema26[index]);
  const signal = emaSeries(macd, 9);
  const hist = macd.map((value, index) => value - signal[index]);

  const overlayValues = snapshot.overlays.flatMap((overlay) => {
    if (overlay.kind === 'entry-zone') return [overlay.low, overlay.high];
    return [overlay.value, overlay.from?.value, overlay.to?.value].filter((value): value is number => typeof value === 'number');
  });
  const min = Math.min(...visible.map((bar) => bar.low), ...overlayValues);
  const max = Math.max(...visible.map((bar) => bar.high), ...overlayValues);
  const range = Math.max(1, max - min);
  const x = (index: number) => PAD_X + (index / Math.max(1, visible.length - 1)) * (W - PAD_X * 2);
  const xForTime = (time: string) => {
    const fullIndex = bars.findIndex((bar) => bar.time === time);
    const visibleIndex = Math.max(0, Math.min(visible.length - 1, fullIndex - firstVisibleIndex));
    return x(visibleIndex);
  };
  const yPrice = (value: number) => PAD_Y + ((max - value) / range) * (PRICE_H - PAD_Y * 2);
  const candleWidth = Math.max(3, ((W - PAD_X * 2) / Math.max(1, visible.length)) * 0.55);
  const rsiTop = PRICE_H + GAP;
  const rsiY = (value: number) => rsiTop + 12 + ((100 - value) / 100) * (RSI_H - 24);
  const macdTop = rsiTop + RSI_H + GAP;
  const macdMax = Math.max(0.01, ...macd.map(Math.abs), ...signal.map(Math.abs), ...hist.map(Math.abs));
  const macdY = (value: number) => macdTop + MACD_H / 2 - (value / macdMax) * (MACD_H * 0.38);
  const volTop = macdTop + MACD_H + GAP;
  const maxVol = Math.max(1, ...visible.map((bar) => bar.volume));
  const volY = (value: number) => volTop + VOL_H - (value / maxVol) * (VOL_H - 18);

  const zones = snapshot.overlays.filter((overlay): overlay is ZoneOverlay => overlay.kind === 'entry-zone');
  const lines = snapshot.overlays.filter(isPricedLineOverlay);
  const segments = snapshot.overlays.filter(isSegmentLineOverlay);
  const lastRsi = [...rsi].reverse().find((value): value is number => typeof value === 'number');
  const lastMacd = macd.at(-1);
  const lastSignal = signal.at(-1);
  const lastBar = visible.at(-1);
  const avgVol = visible.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, visible.slice(-20).length);
  const relVol = avgVol > 0 && lastBar ? lastBar.volume / avgVol : 0;

  const volumeProfile = buildVolumeProfile(visible, min, max);
  const profileMaxVolume = Math.max(1, ...volumeProfile.map((bin) => bin.total));
  const pocIndex = volumeProfile.reduce((bestIndex, bin, index, bins) => bin.total > bins[bestIndex].total ? index : bestIndex, 0);
  const priceTicks = Array.from({ length: 6 }, (_, index) => max - (range * index) / 5);

  const toggleIndicator = (key: IndicatorKey) => setIndicators((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="technicalChartWrap">
      <div className="chartIndicatorControls" aria-label="Indicadores visibles">
        {(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).map((key) => (
          <button key={key} type="button" className={indicators[key] ? 'active' : ''} onClick={() => toggleIndicator(key)} aria-pressed={indicators[key]}>
            {INDICATOR_LABELS[key]}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="technicalChart technicalChartExpanded" role="img" aria-label={`${snapshot.symbol} ${snapshot.timeframe} technical chart`}>
        <defs>
          <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b1c2b"/><stop offset="100%" stopColor="#06111c"/></linearGradient>
          <clipPath id="priceClip"><rect x={PAD_X} y={0} width={W - PAD_X * 2} height={PRICE_H}/></clipPath>
        </defs>
        <rect width={W} height={H} rx="12" fill="url(#chartBg)" />

        {priceTicks.map((tick) => {
          const py = yPrice(tick);
          return <g key={`tick-${tick}`}><line x1={PAD_X} x2={W - PAD_X} y1={py} y2={py} className="gridLine"/><text x={W - PAD_X + 5} y={py + 3} className="priceAxisLabel">{tick.toFixed(2)}</text></g>;
        })}

        {indicators.profile ? <>
          <g clipPath="url(#priceClip)" className="volumeProfile">
            {volumeProfile.map((bin, index) => {
              const center = (bin.low + bin.high) / 2;
              const binHeight = Math.max(3, Math.abs(yPrice(bin.low) - yPrice(bin.high)) - 1);
              const width = (bin.total / profileMaxVolume) * PROFILE_MAX_W;
              const upWidth = bin.total > 0 ? width * (bin.up / bin.total) : 0;
              const downWidth = Math.max(0, width - upWidth);
              const top = yPrice(center) - binHeight / 2;
              return <g key={`vp-${index}`} className={index === pocIndex ? 'profileBin poc' : 'profileBin'}><rect x={PAD_X} y={top} width={downWidth} height={binHeight} className="profileDown"/><rect x={PAD_X + downWidth} y={top} width={upWidth} height={binHeight} className="profileUp"/></g>;
            })}
          </g>
          <text x={PAD_X + 4} y={PAD_Y + 10} className="profileCaption">VOLUME PROFILE · POC</text>
        </> : null}

        {zones.map((zone) => {
          const top = yPrice(zone.high);
          const bottom = yPrice(zone.low);
          return <g key={zone.id}><rect x={PAD_X} y={top} width={W - PAD_X * 2} height={Math.max(4, bottom - top)} className={`zoneRect ${zone.id}`}/><text x={PAD_X + PROFILE_MAX_W + 10} y={top + 15} className="zoneLabel">{zone.label} {zone.low.toFixed(2)}–{zone.high.toFixed(2)}</text></g>;
        })}

        {segments.map((line) => <g key={line.id}><line x1={xForTime(line.from.time)} y1={yPrice(line.from.value)} x2={xForTime(line.to.time)} y2={yPrice(line.to.value)} className={`overlayLine ${line.kind} segmentLine ${line.id}`}/><text x={xForTime(line.to.time)-4} y={yPrice(line.to.value)-6} textAnchor="end" className={`overlayLabel ${line.kind}`}>{line.label}</text></g>)}

        {lines.map((line) => {
          if (line.kind === 'ema' && !indicators.ema) return null;
          const py = yPrice(line.value);
          const keyLevel = line.kind === 'stop' || line.kind === 'target' || line.kind === 'resistance';
          return <g key={line.id}><line x1={PAD_X} x2={W-PAD_X} y1={py} y2={py} className={overlayClassName(line)}/>{keyLevel ? <rect x={W-PAD_X-90} y={py-10} width={86} height={18} rx={3} className={`levelBadge ${line.kind}`}/> : null}<text x={W-PAD_X-6} y={py+3} textAnchor="end" className={`overlayLabel ${line.kind} ${line.id}`}>{line.label} {line.value.toFixed(2)}</text></g>;
        })}

        {visible.map((bar, index) => {
          const cx = x(index);
          const up = bar.close >= bar.open;
          const top = yPrice(Math.max(bar.open, bar.close));
          const bottom = yPrice(Math.min(bar.open, bar.close));
          return <g key={bar.time}><line x1={cx} x2={cx} y1={yPrice(bar.high)} y2={yPrice(bar.low)} className={up ? 'wick up' : 'wick down'}/><rect x={cx-candleWidth/2} y={top} width={candleWidth} height={Math.max(1.5,bottom-top)} className={up ? 'candle up' : 'candle down'}/></g>;
        })}

        {lastBar ? <g><line x1={PAD_X} x2={W-PAD_X} y1={yPrice(lastBar.close)} y2={yPrice(lastBar.close)} className="currentPriceLine"/><rect x={W-PAD_X-63} y={yPrice(lastBar.close)-10} width={59} height={19} rx={3} className="currentPriceBadge"/><text x={W-PAD_X-8} y={yPrice(lastBar.close)+3} textAnchor="end" className="currentPriceText">{lastBar.close.toFixed(2)}</text></g> : null}

        {indicators.rsi ? <>
          <line x1={PAD_X} x2={W-PAD_X} y1={rsiTop} y2={rsiTop} className="indicatorDivider"/>
          <text x={PAD_X} y={rsiTop+15} className="indicatorLabel">RSI 14 {lastRsi?.toFixed(1) ?? '—'}</text>
          {[30,50,70].map((level) => <line key={level} x1={PAD_X} x2={W-PAD_X} y1={rsiY(level)} y2={rsiY(level)} className={level===50 ? 'indicatorMid' : 'indicatorGuide'}/>)}
          <path d={pathFrom(rsi,x,rsiY)} className="rsiPath" fill="none"/>
        </> : null}

        {indicators.macd ? <>
          <line x1={PAD_X} x2={W-PAD_X} y1={macdTop} y2={macdTop} className="indicatorDivider"/>
          <text x={PAD_X} y={macdTop+15} className="indicatorLabel">MACD 12 26 9 {lastMacd?.toFixed(2) ?? '—'} / {lastSignal?.toFixed(2) ?? '—'}</text>
          <line x1={PAD_X} x2={W-PAD_X} y1={macdY(0)} y2={macdY(0)} className="indicatorMid"/>
          {hist.map((value,index) => <rect key={index} x={x(index)-2.2} y={Math.min(macdY(value),macdY(0))} width={4.4} height={Math.max(1,Math.abs(macdY(value)-macdY(0)))} className={value>=0 ? 'macdBar positive' : 'macdBar negative'}/>)}
          <path d={pathFrom(macd,x,macdY)} className="macdPath" fill="none"/><path d={pathFrom(signal,x,macdY)} className="signalPath" fill="none"/>
        </> : null}

        {indicators.volume ? <>
          <line x1={PAD_X} x2={W-PAD_X} y1={volTop} y2={volTop} className="indicatorDivider"/>
          <text x={PAD_X} y={volTop+14} className="indicatorLabel">VOL · Rel {relVol.toFixed(2)}x</text>
          {visible.map((bar,index) => <rect key={`v-${bar.time}`} x={x(index)-2.4} y={volY(bar.volume)} width={4.8} height={Math.max(1,volTop+VOL_H-volY(bar.volume))} className={bar.close>=bar.open ? 'volumeBar positive' : 'volumeBar negative'}/>)}
        </> : null}
      </svg>
      <div className="chartLegend">
        <span><b>{snapshot.currentPrice.toFixed(2)}</b> último</span>
        {indicators.ema ? <><span className="emaLegend ema9Legend">EMA9 <b>{snapshot.ema9 ?? '—'}</b></span><span className="emaLegend ema21Legend">EMA21 <b>{snapshot.ema21 ?? '—'}</b></span><span className="emaLegend ema50Legend">EMA50 <b>{snapshot.ema50 ?? '—'}</b></span><span className="emaLegend ema200Legend">EMA200 <b>{snapshot.ema200 ?? '—'}</b></span></> : null}
        {indicators.rsi ? <span>RSI14 <b>{snapshot.rsi14 ?? '—'}</b></span> : null}
        <span>ATR14 <b>{snapshot.atr14 ?? '—'}</b></span>
        {indicators.macd ? <span>MACD <b>{lastMacd?.toFixed(2) ?? '—'}</b></span> : null}
        {indicators.volume ? <span>RelVol <b>{relVol.toFixed(2)}x</b></span> : null}
        <span>Tendencia <b>{snapshot.trend}</b></span><span>Estructura <b>{snapshot.structure}</b></span>
      </div>
    </div>
  );
}
