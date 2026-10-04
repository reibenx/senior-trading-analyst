import type { AlertEvent, Position } from '../domain/trading';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<{ price: number; currency: string; timestamp: string }>;
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
}

export interface FundamentalDataProvider {
  getFundamentals(symbol: string): Promise<Record<string, number | string | null>>;
}

export interface BrokerAdapter {
  getPositions(): Promise<Position[]>;
}

export interface NotificationProvider {
  send(event: AlertEvent): Promise<void>;
}

export interface ChartOverlay {
  id: string;
  kind: 'horizontal-line' | 'trend-line' | 'zone' | 'moving-average' | 'label';
  label: string;
  data: Record<string, unknown>;
}

export interface ChartAdapter {
  render(symbol: string, overlays: ChartOverlay[]): Promise<void> | void;
}
