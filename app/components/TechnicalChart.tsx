import type { LineOverlay, OHLCVBar, TechnicalSnapshot, ZoneOverlay } from '@/core/domain/market';

interface Props {
  bars: OHLCVBar[];
  snapshot: TechnicalSnapshot;
}

type PricedLineOverlay = LineOverlay & { value: number };
type SegmentLineOverlay = LineOverlay & {
  from: { time: string; value: number };
  to: { time: string; value: number };
};

const W = 920;
const H = 480;
const PAD_X = 36;
const PAD_Y = 24;

function isPricedLineOverlay(overlay: TechnicalSnapshot['overlays'][number]): overlay is PricedLineOverlay {
  return overlay.kind !== 'entry-zone' && typeof overlay.value === 'number';
}

function isSegmentLineOverlay(overlay: TechnicalSnapshot['overlays'][number]): overlay is SegmentLineOverlay {
  return overlay.kind !== 'entry-zone' && Boolean(overlay.from && overlay.to);
}

export function TechnicalChart({ bars, snapshot }: Props) {
  const visible = bars.slice(-80);
  const firstVisibleIndex = Math.max(0, bars.length - visible.length);
  const overlayValues = snapshot.overlays.flatMap((overlay) => {
    if (overlay.kind === 'entry-zone') return [overlay.low, overlay.high];
    const values: number[] = [];
    if (typeof overlay.value === 'number') values.push(overlay.value);
    if (overlay.from) values.push(overlay.from.value);
    if (overlay.to) values.push(overlay.to.value);
    return values;
  });

  const lows = visible.map((bar) => bar.low);
  const highs = visible.map((bar) => bar.high);
  const min = Math.min(...lows, ...overlayValues);
  const max = Math.max(...highs, ...overlayValues);
  const range = Math.max(1, max - min);
  const x = (index: number) => PAD_X + (index / Math.max(1, visible.length - 1)) * (W - PAD_X * 2);
  const xForTime = (time: string) => {
    const fullIndex = bars.findIndex((bar) => bar.time === time);
    if (fullIndex < 0) return PAD_X;
    const visibleIndex = Math.max(0, Math.min(visible.length - 1, fullIndex - firstVisibleIndex));
    return x(visibleIndex);
  };
  const y = (value: number) => PAD_Y + ((max - value) / range) * (H - PAD_Y * 2);
  const candleWidth = Math.max(3, ((W - PAD_X * 2) / Math.max(1, visible.length)) * 0.55);

  const zones = snapshot.overlays.filter((overlay): overlay is ZoneOverlay => overlay.kind === 'entry-zone');
  const lines = snapshot.overlays.filter(isPricedLineOverlay);
  const segments = snapshot.overlays.filter(isSegmentLineOverlay);

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
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1={PAD_X} x2={W - PAD_X} y1={H * ratio} y2={H * ratio} className="gridLine" />
        ))}

        {zones.map((zone) => {
          const top = y(zone.high);
          const bottom = y(zone.low);
          return (
            <g key={zone.id}>
              <rect x={PAD_X} y={top} width={W - PAD_X * 2} height={Math.max(4, bottom - top)} className={`zoneRect ${zone.id}`} />
              <text x={PAD_X + 8} y={top + 15} className="zoneLabel">
                {zone.label} {zone.low.toFixed(2)}–{zone.high.toFixed(2)}
              </text>
            </g>
          );
        })}

        {segments.map((line) => (
          <g key={line.id}>
            <line
              x1={xForTime(line.from.time)}
              y1={y(line.from.value)}
              x2={xForTime(line.to.time)}
              y2={y(line.to.value)}
              className={`overlayLine ${line.kind} segmentLine ${line.id}`}
            />
            <text
              x={xForTime(line.to.time) - 4}
              y={y(line.to.value) - 6}
              textAnchor="end"
              className={`overlayLabel ${line.kind}`}
            >
              {line.label}
            </text>
          </g>
        ))}

        {lines.map((line) => {
          const lineY = y(line.value);
          return (
            <g key={line.id}>
              <line x1={PAD_X} x2={W - PAD_X} y1={lineY} y2={lineY} className={`overlayLine ${line.kind}`} />
              <text x={W - PAD_X - 4} y={lineY - 5} textAnchor="end" className={`overlayLabel ${line.kind}`}>
                {line.label} {line.value.toFixed(2)}
              </text>
            </g>
          );
        })}

        {visible.map((bar, index) => {
          const cx = x(index);
          const isUp = bar.close >= bar.open;
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBottom = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.time}>
              <line x1={cx} x2={cx} y1={y(bar.high)} y2={y(bar.low)} className={isUp ? 'wick up' : 'wick down'} />
              <rect
                x={cx - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={Math.max(1.5, bodyBottom - bodyTop)}
                className={isUp ? 'candle up' : 'candle down'}
              />
            </g>
          );
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
