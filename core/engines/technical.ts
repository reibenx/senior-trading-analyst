import type { IndicatorPoint, OHLCVBar, TechnicalSnapshot, Timeframe, LineOverlay, ZoneOverlay } from '@/core/domain/market';
import {
  atr,
  ema,
  recentPivotHighPoints,
  recentPivotHighs,
  recentPivotLowPoints,
  recentPivotLows,
  rsi,
  vwap,
} from '@/core/engines/indicators';

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function detectStructure(bars: OHLCVBar[]): TechnicalSnapshot['structure'] {
  const lows = recentPivotLows(bars, 2, 3);
  const highs = recentPivotHighs(bars, 2, 3);

  if (lows.length >= 2 && highs.length >= 2) {
    const previousLow = lows[lows.length - 2];
    const latestLow = lows[lows.length - 1];
    const previousHigh = highs[highs.length - 2];
    const latestHigh = highs[highs.length - 1];

    if (latestLow > previousLow && latestHigh > previousHigh) return 'HH_HL';
    if (latestLow < previousLow && latestHigh < previousHigh) return 'LH_LL';
  }

  return 'RANGE';
}

function detectTrend(currentPrice: number, ema50?: number, ema200?: number): TechnicalSnapshot['trend'] {
  if (ema50 !== undefined && ema200 !== undefined && currentPrice > ema50 && ema50 > ema200) return 'BULL';
  if (ema50 !== undefined && ema200 !== undefined && currentPrice < ema50 && ema50 < ema200) return 'BEAR';
  return 'NEUTRAL';
}

function projectedTrendline(
  bars: OHLCVBar[],
  points: IndicatorPoint[],
  id: string,
  label: string,
): LineOverlay | undefined {
  if (points.length < 2) return undefined;
  const from = points[points.length - 2];
  const pivotTo = points[points.length - 1];
  const fromIndex = bars.findIndex((bar) => bar.time === from.time);
  const pivotToIndex = bars.findIndex((bar) => bar.time === pivotTo.time);
  const latestIndex = bars.length - 1;
  if (fromIndex < 0 || pivotToIndex <= fromIndex || latestIndex <= pivotToIndex) return undefined;

  const slope = (pivotTo.value - from.value) / (pivotToIndex - fromIndex);
  const projectedValue = pivotTo.value + slope * (latestIndex - pivotToIndex);

  return {
    id,
    kind: 'trendline',
    label,
    from: { time: from.time, value: round(from.value) },
    to: { time: bars[latestIndex].time, value: round(projectedValue) },
    meta: { pivotTime: pivotTo.time, pivotValue: round(pivotTo.value), slopePerBar: slope },
  };
}

function fibonacciOverlays(
  bars: OHLCVBar[],
  lowPivots: IndicatorPoint[],
  highPivots: IndicatorPoint[],
  volatility: number,
): LineOverlay[] {
  const latestLow = lowPivots.at(-1);
  const latestHigh = highPivots.at(-1);
  if (!latestLow || !latestHigh) return [];

  const lowIndex = bars.findIndex((bar) => bar.time === latestLow.time);
  const highIndex = bars.findIndex((bar) => bar.time === latestHigh.time);
  if (lowIndex < 0 || highIndex < 0 || lowIndex === highIndex) return [];

  const swingRange = Math.abs(latestHigh.value - latestLow.value);
  if (swingRange < volatility * 2) return [];

  const ratios = [0.382, 0.5, 0.618];
  const upswing = lowIndex < highIndex;

  return ratios.map((ratio) => {
    const value = upswing
      ? latestHigh.value - swingRange * ratio
      : latestLow.value + swingRange * ratio;

    return {
      id: `fib-${Math.round(ratio * 1000)}`,
      kind: 'fibonacci',
      label: `Fib ${(ratio * 100).toFixed(1)}%`,
      value: round(value),
      meta: {
        ratio,
        direction: upswing ? 'up' : 'down',
        swingLow: round(Math.min(latestLow.value, latestHigh.value)),
        swingHigh: round(Math.max(latestLow.value, latestHigh.value)),
      },
    } satisfies LineOverlay;
  });
}

function shouldShowVwap(timeframe: Timeframe): boolean {
  return timeframe === '1m' || timeframe === '5m' || timeframe === '15m' || timeframe === '1h';
}

export interface TechnicalAnalysisInput {
  symbol: string;
  timeframe: Timeframe;
  bars: OHLCVBar[];
}

export function buildTechnicalSnapshot(input: TechnicalAnalysisInput): TechnicalSnapshot {
  const { symbol, timeframe, bars } = input;
  if (bars.length < 20) throw new Error('At least 20 OHLCV bars are required');

  const closes = bars.map((bar) => bar.close);
  const currentPrice = closes[closes.length - 1];
  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const atr14 = atr(bars, 14);
  const rsi14 = rsi(closes, 14);
  const rollingVwap = shouldShowVwap(timeframe) ? vwap(bars, 20) : undefined;

  const supportLevels = recentPivotLows(bars, 3, 6)
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const resistanceLevels = recentPivotHighs(bars, 3, 6)
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 3);

  const lowPivots = recentPivotLowPoints(bars, 3, 4);
  const highPivots = recentPivotHighPoints(bars, 3, 4);
  const structure = detectStructure(bars);
  const trend = detectTrend(currentPrice, ema50, ema200);
  const volatility = atr14 ?? currentPrice * 0.025;

  const overlays: Array<LineOverlay | ZoneOverlay> = [];
  if (ema9 !== undefined) overlays.push({ id: 'ema9', kind: 'ema', label: 'EMA 9', value: round(ema9) });
  if (ema21 !== undefined) overlays.push({ id: 'ema21', kind: 'ema', label: 'EMA 21', value: round(ema21) });
  if (ema50 !== undefined) overlays.push({ id: 'ema50', kind: 'ema', label: 'EMA 50', value: round(ema50) });
  if (ema200 !== undefined) overlays.push({ id: 'ema200', kind: 'ema', label: 'EMA 200', value: round(ema200) });
  if (rollingVwap !== undefined) overlays.push({ id: 'vwap20', kind: 'vwap', label: 'VWAP 20', value: round(rollingVwap) });

  supportLevels.forEach((value, index) => overlays.push({ id: `support-${index}`, kind: 'support', label: `S${index + 1}`, value: round(value) }));
  resistanceLevels.forEach((value, index) => overlays.push({ id: `resistance-${index}`, kind: 'resistance', label: `R${index + 1}`, value: round(value) }));

  const supportTrendline = projectedTrendline(bars, lowPivots, 'trend-support', 'Trendline soporte');
  const resistanceTrendline = projectedTrendline(bars, highPivots, 'trend-resistance', 'Trendline resistencia');
  if (supportTrendline) overlays.push(supportTrendline);
  if (resistanceTrendline) overlays.push(resistanceTrendline);
  overlays.push(...fibonacciOverlays(bars, lowPivots, highPivots, volatility));

  const referenceSupport = supportLevels[0] ?? ema21 ?? ema20 ?? ema50 ?? currentPrice * 0.96;
  const entryAHigh = Math.min(currentPrice, referenceSupport + volatility * 0.45);
  const entryALow = Math.max(0, referenceSupport - volatility * 0.35);
  const entryBReference = supportLevels[1] ?? ema200 ?? referenceSupport - volatility * 1.25;
  const entryBHigh = Math.min(entryALow, entryBReference + volatility * 0.35);
  const entryBLow = Math.max(0, entryBReference - volatility * 0.35);
  const stop = Math.max(0, entryBLow - volatility * 0.75);
  const tp1 = currentPrice + volatility * 1.5;
  const tp2 = currentPrice + volatility * 3;

  overlays.push({ id: 'entry-a', kind: 'entry-zone', label: 'Entry A', low: round(entryALow), high: round(entryAHigh) });
  overlays.push({ id: 'entry-b', kind: 'entry-zone', label: 'Entry B', low: round(entryBLow), high: round(entryBHigh) });
  overlays.push({ id: 'stop', kind: 'stop', label: 'Stop / invalidación', value: round(stop) });
  overlays.push({ id: 'tp1', kind: 'target', label: 'TP1', value: round(tp1) });
  overlays.push({ id: 'tp2', kind: 'target', label: 'TP2', value: round(tp2) });

  return {
    symbol,
    timeframe,
    currentPrice: round(currentPrice),
    ema9: ema9 !== undefined ? round(ema9) : undefined,
    ema20: ema20 !== undefined ? round(ema20) : undefined,
    ema21: ema21 !== undefined ? round(ema21) : undefined,
    ema50: ema50 !== undefined ? round(ema50) : undefined,
    ema200: ema200 !== undefined ? round(ema200) : undefined,
    atr14: atr14 !== undefined ? round(atr14) : undefined,
    rsi14: rsi14 !== undefined ? round(rsi14, 1) : undefined,
    trend,
    structure,
    supportLevels: supportLevels.map((value) => round(value)),
    resistanceLevels: resistanceLevels.map((value) => round(value)),
    overlays,
  };
}
