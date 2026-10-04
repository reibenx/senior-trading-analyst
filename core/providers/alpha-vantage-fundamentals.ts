import type { FundamentalDataProvider } from '@/core/adapters/contracts';
import type { FundamentalSnapshot } from '@/core/domain/fundamentals';

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class AlphaVantageFundamentalProvider implements FundamentalDataProvider {
  readonly id = 'alpha-vantage';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('ALPHA_VANTAGE_API_KEY is required');
  }

  async getFundamentals(symbol: string): Promise<FundamentalSnapshot> {
    const params = new URLSearchParams({ function: 'OVERVIEW', symbol, apikey: this.apiKey });
    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) throw new Error(`Alpha Vantage HTTP ${response.status}`);
    const raw = (await response.json()) as Record<string, unknown>;

    if (typeof raw.Note === 'string') throw new Error(raw.Note);
    if (typeof raw.Information === 'string') throw new Error(raw.Information);
    if (!raw.Symbol) throw new Error('Alpha Vantage returned no company overview');

    return {
      symbol: String(raw.Symbol),
      name: typeof raw.Name === 'string' ? raw.Name : undefined,
      sector: typeof raw.Sector === 'string' ? raw.Sector : undefined,
      industry: typeof raw.Industry === 'string' ? raw.Industry : undefined,
      marketCapitalization: parseOptionalNumber(raw.MarketCapitalization),
      trailingPE: parseOptionalNumber(raw.TrailingPE),
      forwardPE: parseOptionalNumber(raw.ForwardPE),
      pegRatio: parseOptionalNumber(raw.PEGRatio),
      priceToSales: parseOptionalNumber(raw.PriceToSalesRatioTTM),
      priceToBook: parseOptionalNumber(raw.PriceToBookRatio),
      evToEbitda: parseOptionalNumber(raw.EVToEBITDA),
      profitMargin: parseOptionalNumber(raw.ProfitMargin),
      operatingMargin: parseOptionalNumber(raw.OperatingMarginTTM),
      returnOnEquity: parseOptionalNumber(raw.ReturnOnEquityTTM),
      returnOnAssets: parseOptionalNumber(raw.ReturnOnAssetsTTM),
      revenueGrowthYoY: parseOptionalNumber(raw.QuarterlyRevenueGrowthYOY),
      earningsGrowthYoY: parseOptionalNumber(raw.QuarterlyEarningsGrowthYOY),
      analystTargetPrice: parseOptionalNumber(raw.AnalystTargetPrice),
      beta: parseOptionalNumber(raw.Beta),
      week52High: parseOptionalNumber(raw['52WeekHigh']),
      week52Low: parseOptionalNumber(raw['52WeekLow']),
      currency: typeof raw.Currency === 'string' ? raw.Currency : undefined,
      asOf: new Date().toISOString(),
    };
  }
}

export function getFundamentalProvider(): FundamentalDataProvider | null {
  const key = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  if (!key) return null;
  return new AlphaVantageFundamentalProvider(key);
}
