import type { OHLCVBar, TechnicalSnapshot, Timeframe, LineOverlay, ZoneOverlay } from '@/core/domain/market';
import { atr, ema, recentPivotHighs, recentPivotLows, rsi } from '@/core/engines/indicators';

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function detectStructure(bars: OHLCVBar[]): TechnicalSnapshot['structure'] {
  const lows = recentPivotLows(bars, 2, 2);
  const highs = recentPivotHighs(bars, 2, 2);
  if (lows.length >= 2 && highs.length >= 2) {
    const higherLows = lows[0] > lows[1];
    const higherHighs = highs[highs.length - 1] > highs[0];
    if (higherLows && higherHighs) return 'HH_HL';
    const lowerLows = lows[0] < lows[1];
    const lowerHighs = highs[highs.length - 1] < highs[0];
    if (lowerLows && lowerHighs) return 'LH_LL';
  }
  return 'RANGE';
}

function detectTrend(currentPrice: number, ema50?: number, ema200?: number): TechnicalSnapshot['trend'] {
  if (ema50 && ema200 && currentPrice > ema50 && ema50 > ema200) return 'BULL';
  if (ema50 && ema200 && currentPrice < ema50 && ema50 < ema200) return 'BEAR';
  return 'NEUTRAL';
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
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const atr14 = atr(bars, 14);
  const rsi14 = rsi(closes, 14);
  const supportLevels = recentPivotLows(bars, 3, 3).filter((level) => level < currentPrice);
  const resistanceLevels = recentPivotHighs(bars, 3, 3).filter((level) => level > currentPrice);
  const structure = detectStructure(bars);
  const trend = detectTrend(currentPrice, ema50, ema200);

  const overlays: Array<LineOverlay | ZoneOverlay> = [];
  if (ema20) overlays.push({ id: 'ema20', kind: 'ema', label: 'EMA 20', value: round(ema20) });
  if (ema50) overlays.push({ id: 'ema50', kind: 'ema', label: 'EMA 50', value: round(ema50) });
  if (ema200) overlays.push({ id: 'ema200', kind: 'ema', label: 'EMA 200', value: round(ema200) });

  supportLevels.forEach((value, index) => overlays.push({ id: `support-${index}`, kind: 'support', label: `S${index + 1}`, value: round(value) }));
  resistanceLevels.forEach((value, index) => overlays.push({ id: `resistance-${index}`, kind: 'resistance', label: `R${index + 1}`, value: round(value) }));

  const referenceSupport = supportLevels[0] ?? ema50 ?? ema20 ?? currentPrice * 0.96;
  const volatility = atr14 ?? currentPrice * 0.025;
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
    ema20: ema20 ? round(ema20) : undefined,
    ema50: ema50 ? round(ema50) : undefined,
    ema200: ema200 ? round(ema200) : undefined,
    atr14: atr14 ? round(atr14) : undefined,
    rsi14: rsi14 ? round(rsi14, 1) : undefined,
    trend,
    structure,
    supportLevels: supportLevels.map((value) => round(value)),
    resistanceLevels: resistanceLevels.map((value) => round(value)),
    overlays,
  };
}
