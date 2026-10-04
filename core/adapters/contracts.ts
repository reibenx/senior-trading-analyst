import type { AlertEvent, Position } from '@/core/domain/trading';
import type { LineOverlay, ZoneOverlay } from '@/core/domain/market';
import type { FundamentalSnapshot } from '@/core/domain/fundamentals';

export interface FundamentalDataProvider {
  id: string;
  getFundamentals(symbol: string): Promise<FundamentalSnapshot>;
}

export interface BrokerAdapter {
  id: string;
  getPositions(): Promise<Position[]>;
}

export interface NotificationProvider {
  id: string;
  send(event: AlertEvent): Promise<void>;
}

export interface ChartAdapter {
  id: string;
  setSymbol(symbol: string): Promise<void> | void;
  setOverlays(overlays: Array<LineOverlay | ZoneOverlay>): Promise<void> | void;
}
