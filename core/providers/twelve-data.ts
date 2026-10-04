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

interface CacheEntry {
  expiresAt: number;
  bars: OHLCVBar[];
}

const barsCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<OHLCVBar[]>>();

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

function cacheTtlMs(timeframe: Timeframe): number {
  const configuredSeconds = Number(process.env.TWELVE_DATA_CACHE_TTL_SECONDS ?? '90');
  const base = Number.isFinite(configuredSeconds) && configuredSeconds >= 30 ? configuredSeconds * 1000 : 90_000;
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1M') return Math.max(base, 5 * 60_000);
  return base;
}

export class TwelveDataMarketDataProvider implements MarketDataProvider {
  readonly id = 'twelve-data';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is required');
  }

  async getBars(request: MarketDataRequest): Promise<OHLCVBar[]> {
    const outputsize = Math.max(20, Math.min(request.limit ?? 260, 5000));
    const symbol = request.symbol.trim().toUpperCase();
    const cacheKey = `${symbol}:${request.timeframe}:${outputsize}`;
    const cached = barsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.bars;

    const existing = inFlight.get(cacheKey);
    if (existing) return existing;

    const task = this.fetchBars(symbol, request.timeframe, outputsize)
      .then((bars) => {
        barsCache.set(cacheKey, { bars, expiresAt: Date.now() + cacheTtlMs(request.timeframe) });
        return bars;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });

    inFlight.set(cacheKey, task);
    return task;
  }

  private async fetchBars(symbol: string, timeframe: Timeframe, outputsize: number): Promise<OHLCVBar[]> {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL_MAP[timeframe],
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
      if (response.status === 429) {
        throw new Error('Twelve Data rate limit reached (HTTP 429). Retry after the credit window resets.');
      }
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
