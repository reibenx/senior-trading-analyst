import type { OHLCVBar } from '@/core/domain/market';

export function createDemoBars(count = 220, start = 118): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  let close = start;
  const baseDate = new Date('2026-01-02T00:00:00Z');

  for (let i = 0; i < count; i += 1) {
    const drift = 0.16 + Math.sin(i / 10) * 0.22 + Math.cos(i / 23) * 0.12;
    const shock = Math.sin(i * 1.73) * 1.65 + Math.cos(i * 0.41) * 0.85;
    const open = close + shock * 0.25;
    close = Math.max(20, open + drift + shock * 0.35);
    const high = Math.max(open, close) + 1.2 + Math.abs(Math.sin(i * 0.8)) * 1.9;
    const low = Math.min(open, close) - 1.1 - Math.abs(Math.cos(i * 0.62)) * 1.7;
    const date = new Date(baseDate);
    date.setUTCDate(baseDate.getUTCDate() + i);

    bars.push({
      time: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(28_000_000 + Math.abs(Math.sin(i * 0.37)) * 44_000_000),
    });
  }

  return bars;
}
