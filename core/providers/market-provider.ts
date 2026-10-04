import type { MarketDataProvider } from '@/core/adapters/market-data';
import { DemoMarketDataProvider } from '@/core/providers/demo-market-data';
import { TwelveDataMarketDataProvider } from '@/core/providers/twelve-data';

export function getMarketDataProvider(): MarketDataProvider {
  const configured = (process.env.MARKET_DATA_PROVIDER ?? 'auto').toLowerCase();
  const twelveDataKey = process.env.TWELVE_DATA_API_KEY?.trim();

  if (configured === 'demo') return new DemoMarketDataProvider();
  if (configured === 'twelve-data') {
    if (!twelveDataKey) throw new Error('MARKET_DATA_PROVIDER=twelve-data requires TWELVE_DATA_API_KEY');
    return new TwelveDataMarketDataProvider(twelveDataKey);
  }

  if (twelveDataKey) return new TwelveDataMarketDataProvider(twelveDataKey);
  return new DemoMarketDataProvider();
}
