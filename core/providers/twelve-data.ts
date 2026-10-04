import type { OHLCVBar, Timeframe } from '@/core/domain/market';
import type { MarketDataProvider, MarketDataRequest } from '@/core/adapters/market-data';

const INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
  '1w': '1week',
  '1M': '1month',
};

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TwelveDataResponse {
  status?: string;
  code?: number;
  message?: string;
  values?: TwelveDataValue[];
}

function parseFinite(value: string | undefined, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field} returned by Twelve Data`);
  return parsed;
}

function normalizeBars(values: TwelveDataValue[]): OHLCVBar[] {
  return values
    .map((value) => ({
      time: value.datetime,
      open: parseFinite(value.open, 'open'),
      high: parseFinite(value.high, 'high'),
      low: parseFinite(value.low, 'low'),
      close: parseFinite(value.close, 'close'),
      volume: value.volume ? parseFinite(value.volume, 'volume') : 0,
    }))
    .filter((bar) => bar.high >= bar.low && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export class TwelveDataMarketDataProvider implements MarketDataProvider {
  readonly id = 'twelve-data';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is required');
  }

  async getBars(request: MarketDataRequest): Promise<OHLCVBar[]> {
    const outputsize = Math.max(20, Math.min(request.limit ?? 260, 5000));
    const params = new URLSearchParams({
      symbol: request.symbol,
      interval: INTERVAL_MAP[request.timeframe],
      outputsize: String(outputsize),
      apikey: this.apiKey,
      format: 'JSON',
      order: 'desc',
    });

    const response = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`Twelve Data HTTP ${response.status}`);
    }

    const payload = (await response.json()) as TwelveDataResponse;
    if (payload.status === 'error' || !payload.values) {
      throw new Error(payload.message ?? 'Twelve Data returned no time series');
    }

    const bars = normalizeBars(payload.values);
    if (bars.length < 20) throw new Error('Insufficient market history returned by Twelve Data');
    return bars;
  }
}
