import type { MarketDataProvider, MarketDataRequest } from '@/core/adapters/market-data';
import { createDemoBars } from '@/core/fixtures/demo-market';

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = 'demo-fixture';

  async getBars(request: MarketDataRequest) {
    const bars = createDemoBars();
    const limit = Math.max(20, request.limit ?? bars.length);
    return bars.slice(-limit);
  }
}
