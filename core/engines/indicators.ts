import type { OHLCVBar } from '@/core/domain/market';

export function sma(values: number[], period: number): number | undefined {
  if (period <= 0 || values.length < period) return undefined;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function ema(values: number[], period: number): number | undefined {
  if (period <= 0 || values.length < period) return undefined;
  const k = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

export function trueRange(current: OHLCVBar, previous?: OHLCVBar): number {
  if (!previous) return current.high - current.low;
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

export function atr(bars: OHLCVBar[], period = 14): number | undefined {
  if (bars.length < period + 1) return undefined;
  const ranges = bars.map((bar, index) => trueRange(bar, bars[index - 1]));
  return ema(ranges, period);
}

export function rsi(values: number[], period = 14): number | undefined {
  if (values.length < period + 1) return undefined;
  let gains = 0;
  let losses = 0;
  const start = values.length - period;
  for (let i = start; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return 100;
  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

function pivotLowsChronological(bars: OHLCVBar[], window: number): number[] {
  const pivots: number[] = [];
  for (let i = window; i < bars.length - window; i += 1) {
    const low = bars[i].low;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j !== i && bars[j].low <= low) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push(low);
  }
  return pivots;
}

function pivotHighsChronological(bars: OHLCVBar[], window: number): number[] {
  const pivots: number[] = [];
  for (let i = window; i < bars.length - window; i += 1) {
    const high = bars[i].high;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j !== i && bars[j].high >= high) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push(high);
  }
  return pivots;
}

export function recentPivotLows(bars: OHLCVBar[], window = 3, limit = 3): number[] {
  if (window < 1 || limit < 1) return [];
  return pivotLowsChronological(bars, window).slice(-limit);
}

export function recentPivotHighs(bars: OHLCVBar[], window = 3, limit = 3): number[] {
  if (window < 1 || limit < 1) return [];
  return pivotHighsChronological(bars, window).slice(-limit);
}
