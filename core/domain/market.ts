export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface OHLCVBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: string;
  value: number;
}

export type LineOverlayKind =
  | 'ema'
  | 'sma'
  | 'support'
  | 'resistance'
  | 'trendline'
  | 'stop'
  | 'target'
  | 'vwap';

export type OverlayKind = LineOverlayKind | 'entry-zone';

export interface LineOverlay {
  id: string;
  kind: LineOverlayKind;
  label: string;
  value?: number;
  from?: { time: string; value: number };
  to?: { time: string; value: number };
  meta?: Record<string, unknown>;
}

export interface ZoneOverlay {
  id: string;
  kind: 'entry-zone';
  label: string;
  low: number;
  high: number;
  meta?: Record<string, unknown>;
}

export type ChartOverlay = LineOverlay | ZoneOverlay;

export interface TechnicalSnapshot {
  symbol: string;
  timeframe: Timeframe;
  currentPrice: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  atr14?: number;
  rsi14?: number;
  trend: 'BULL' | 'NEUTRAL' | 'BEAR';
  structure: 'HH_HL' | 'RANGE' | 'LH_LL';
  supportLevels: number[];
  resistanceLevels: number[];
  overlays: ChartOverlay[];
}
