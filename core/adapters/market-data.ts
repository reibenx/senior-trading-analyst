import type { OHLCVBar, Timeframe } from '@/core/domain/market';

export interface MarketDataRequest {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
}

export interface MarketDataProvider {
  id: string;
  getBars(request: MarketDataRequest): Promise<OHLCVBar[]>;
}
