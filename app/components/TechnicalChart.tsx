import type { LineOverlay, OHLCVBar, TechnicalSnapshot, ZoneOverlay } from '@/core/domain/market';

interface Props {
  bars: OHLCVBar[];
  snapshot: TechnicalSnapshot;
}

type PricedLineOverlay = LineOverlay & { value: number };
type SegmentLineOverlay = LineOverlay & { from: { time: string; value: number }; to: { time: string; value: number } };

const W = 920;
const PRICE_H = 390;
const RSI_H = 92;
const MACD_H = 112;
const VOL_H = 70;
const GAP = 12;
const H = PRICE_H + RSI_H + MACD_H + VOL_H + GAP * 3;
const PAD_X = 44;
const PAD_Y = 22;

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
  for (let i = 1; i < values.length; i += 1) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}
function rsiSeries(values: number[], period = 14) {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length <= period) return out;
  let gains = 0; let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0);
  }
  let avgGain = gains / period; let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}
function pathFrom(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number) {
  let d = '';
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    d += `${d ? 'L' : 'M'} ${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
  });
  return d;
}

export function TechnicalChart({ bars, snapshot }: Props) {
  const visible = bars.slice(-80);
  const firstVisibleIndex = Math.max(0, bars.length - visible.length);
  const closes = visible.map((bar) => bar.close);
  const rsi = rsiSeries(closes);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = closes.map((_, i) => ema12[i] - ema26[i]);
  const signal = emaSeries(macd, 9);
  const hist = macd.map((value, i) => value - signal[i]);

  const overlayValues = snapshot.overlays.flatMap((overlay) => {
    if (overlay.kind === 'entry-zone') return [overlay.low, overlay.high];
    return [overlay.value, overlay.from?.value, overlay.to?.value].filter((v): v is number => typeof v === 'number');
  });
  const min = Math.min(...visible.map((b) => b.low), ...overlayValues);
  const max = Math.max(...visible.map((b) => b.high), ...overlayValues);
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
  const lastRsi = [...rsi].reverse().find((v): v is number => typeof v === 'number');
  const lastMacd = macd.at(-1);
  const lastSignal = signal.at(-1);
  const avgVol = visible.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, visible.slice(-20).length);
  const relVol = avgVol > 0 ? visible.at(-1)!.volume / avgVol : 0;

  return (
    <div className="technicalChartWrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="technicalChart technicalChartExpanded" role="img" aria-label={`${snapshot.symbol} ${snapshot.timeframe} technical chart`}>
        <defs><linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b1c2b"/><stop offset="100%" stopColor="#06111c"/></linearGradient></defs>
        <rect width={W} height={H} rx="12" fill="url(#chartBg)" />
        {[0.2,0.4,0.6,0.8].map((ratio) => <line key={ratio} x1={PAD_X} x2={W-PAD_X} y1={PRICE_H*ratio} y2={PRICE_H*ratio} className="gridLine" />)}
        {zones.map((zone) => { const top=yPrice(zone.high); const bottom=yPrice(zone.low); return <g key={zone.id}><rect x={PAD_X} y={top} width={W-PAD_X*2} height={Math.max(4,bottom-top)} className={`zoneRect ${zone.id}`}/><text x={PAD_X+8} y={top+15} className="zoneLabel">{zone.label} {zone.low.toFixed(2)}–{zone.high.toFixed(2)}</text></g>; })}
        {segments.map((line) => <g key={line.id}><line x1={xForTime(line.from.time)} y1={yPrice(line.from.value)} x2={xForTime(line.to.time)} y2={yPrice(line.to.value)} className={`overlayLine ${line.kind} segmentLine ${line.id}`}/><text x={xForTime(line.to.time)-4} y={yPrice(line.to.value)-6} textAnchor="end" className={`overlayLabel ${line.kind}`}>{line.label}</text></g>)}
        {lines.map((line) => { const py=yPrice(line.value); return <g key={line.id}><line x1={PAD_X} x2={W-PAD_X} y1={py} y2={py} className={`overlayLine ${line.kind}`}/><text x={W-PAD_X-4} y={py-5} textAnchor="end" className={`overlayLabel ${line.kind}`}>{line.label} {line.value.toFixed(2)}</text></g>; })}
        {visible.map((bar,index) => { const cx=x(index); const up=bar.close>=bar.open; const top=yPrice(Math.max(bar.open,bar.close)); const bottom=yPrice(Math.min(bar.open,bar.close)); return <g key={bar.time}><line x1={cx} x2={cx} y1={yPrice(bar.high)} y2={yPrice(bar.low)} className={up?'wick up':'wick down'}/><rect x={cx-candleWidth/2} y={top} width={candleWidth} height={Math.max(1.5,bottom-top)} className={up?'candle up':'candle down'}/></g>; })}

        <line x1={PAD_X} x2={W-PAD_X} y1={rsiTop} y2={rsiTop} className="indicatorDivider"/>
        <text x={PAD_X} y={rsiTop+15} className="indicatorLabel">RSI 14 {lastRsi?.toFixed(1) ?? '—'}</text>
        {[30,50,70].map((level)=><line key={level} x1={PAD_X} x2={W-PAD_X} y1={rsiY(level)} y2={rsiY(level)} className={level===50?'indicatorMid':'indicatorGuide'}/>)}
        <path d={pathFrom(rsi,x,rsiY)} className="rsiPath" fill="none"/>

        <line x1={PAD_X} x2={W-PAD_X} y1={macdTop} y2={macdTop} className="indicatorDivider"/>
        <text x={PAD_X} y={macdTop+15} className="indicatorLabel">MACD 12 26 9 {lastMacd?.toFixed(2) ?? '—'} / {lastSignal?.toFixed(2) ?? '—'}</text>
        <line x1={PAD_X} x2={W-PAD_X} y1={macdY(0)} y2={macdY(0)} className="indicatorMid"/>
        {hist.map((value,index)=><rect key={index} x={x(index)-2.2} y={Math.min(macdY(value),macdY(0))} width={4.4} height={Math.max(1,Math.abs(macdY(value)-macdY(0)))} className={value>=0?'macdBar positive':'macdBar negative'}/>)}
        <path d={pathFrom(macd,x,macdY)} className="macdPath" fill="none"/><path d={pathFrom(signal,x,macdY)} className="signalPath" fill="none"/>

        <line x1={PAD_X} x2={W-PAD_X} y1={volTop} y2={volTop} className="indicatorDivider"/>
        <text x={PAD_X} y={volTop+14} className="indicatorLabel">VOL · Rel {relVol.toFixed(2)}x</text>
        {visible.map((bar,index)=><rect key={`v-${bar.time}`} x={x(index)-2.4} y={volY(bar.volume)} width={4.8} height={Math.max(1,volTop+VOL_H-volY(bar.volume))} className={bar.close>=bar.open?'volumeBar positive':'volumeBar negative'}/>)}
      </svg>
      <div className="chartLegend"><span><b>{snapshot.currentPrice.toFixed(2)}</b> último</span><span>RSI14 <b>{snapshot.rsi14 ?? '—'}</b></span><span>ATR14 <b>{snapshot.atr14 ?? '—'}</b></span><span>MACD <b>{lastMacd?.toFixed(2) ?? '—'}</b></span><span>RelVol <b>{relVol.toFixed(2)}x</b></span><span>Tendencia <b>{snapshot.trend}</b></span><span>Estructura <b>{snapshot.structure}</b></span></div>
    </div>
  );
}
