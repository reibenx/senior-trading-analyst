import type { OHLCVBar, TechnicalSnapshot, ZoneOverlay } from '@/core/domain/market';

interface Props {
  bars: OHLCVBar[];
  snapshot: TechnicalSnapshot;
}

const W = 920;
const H = 480;
const PAD_X = 36;
const PAD_Y = 24;

export function TechnicalChart({ bars, snapshot }: Props) {
  const visible = bars.slice(-80);
  const overlayValues = snapshot.overlays.flatMap((overlay) => {
    if ('value' in overlay && typeof overlay.value === 'number') return [overlay.value];
    if (overlay.kind === 'entry-zone') return [overlay.low, overlay.high];
    return [];
  });
  const lows = visible.map((bar) => bar.low);
  const highs = visible.map((bar) => bar.high);
  const min = Math.min(...lows, ...overlayValues);
  const max = Math.max(...highs, ...overlayValues);
  const range = Math.max(1, max - min);
  const x = (index: number) => PAD_X + (index / Math.max(1, visible.length - 1)) * (W - PAD_X * 2);
  const y = (value: number) => PAD_Y + ((max - value) / range) * (H - PAD_Y * 2);
  const candleWidth = Math.max(3, (W - PAD_X * 2) / visible.length * 0.55);

  const zones = snapshot.overlays.filter((overlay): overlay is ZoneOverlay => overlay.kind === 'entry-zone');
  const lines = snapshot.overlays.filter((overlay) => 'value' in overlay && typeof overlay.value === 'number');

  return (
    <div className="technicalChartWrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="technicalChart" role="img" aria-label={`${snapshot.symbol} ${snapshot.timeframe} technical chart`}>
        <defs>
          <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d2032" />
            <stop offset="100%" stopColor="#081522" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} rx="12" fill="url(#chartBg)" />
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} x1={PAD_X} x2={W - PAD_X} y1={H * ratio} y2={H * ratio} className="gridLine" />)}

        {zones.map((zone) => {
          const top = y(zone.high);
          const bottom = y(zone.low);
          return <g key={zone.id}><rect x={PAD_X} y={top} width={W - PAD_X * 2} height={Math.max(4, bottom - top)} className={`zoneRect ${zone.id}`} /><text x={PAD_X + 8} y={top + 15} className="zoneLabel">{zone.label} {zone.low.toFixed(2)}–{zone.high.toFixed(2)}</text></g>;
        })}

        {lines.map((line) => {
          const lineY = y(line.value as number);
          return <g key={line.id}><line x1={PAD_X} x2={W - PAD_X} y1={lineY} y2={lineY} className={`overlayLine ${line.kind}`} /><text x={W - PAD_X - 4} y={lineY - 5} textAnchor="end" className={`overlayLabel ${line.kind}`}>{line.label} {(line.value as number).toFixed(2)}</text></g>;
        })}

        {visible.map((bar, index) => {
          const cx = x(index);
          const isUp = bar.close >= bar.open;
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBottom = y(Math.min(bar.open, bar.close));
          return <g key={bar.time}><line x1={cx} x2={cx} y1={y(bar.high)} y2={y(bar.low)} className={isUp ? 'wick up' : 'wick down'} /><rect x={cx - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(1.5, bodyBottom - bodyTop)} className={isUp ? 'candle up' : 'candle down'} /></g>;
        })}
      </svg>
      <div className="chartLegend">
        <span><b>{snapshot.currentPrice.toFixed(2)}</b> último</span>
        <span>RSI14 <b>{snapshot.rsi14 ?? '—'}</b></span>
        <span>ATR14 <b>{snapshot.atr14 ?? '—'}</b></span>
        <span>Tendencia <b>{snapshot.trend}</b></span>
        <span>Estructura <b>{snapshot.structure}</b></span>
      </div>
    </div>
  );
}
