export interface NewsInsight {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  sentiment?: string;
  relevance?: number;
}

export interface EarningsEvent {
  symbol: string;
  name?: string;
  reportDate: string;
  fiscalDateEnding?: string;
  estimate?: number;
  currency?: string;
}

type CacheEntry<T> = { expiresAt: number; value: T };

const newsCache = new Map<string, CacheEntry<NewsInsight[]>>();
const earningsCache = new Map<string, CacheEntry<EarningsEvent[]>>();
const newsInFlight = new Map<string, Promise<NewsInsight[]>>();
const earningsInFlight = new Map<string, Promise<EarningsEvent[]>>();

function ttlMs(kind: 'news' | 'earnings') {
  const envName = kind === 'news' ? 'ALPHA_VANTAGE_NEWS_CACHE_TTL_HOURS' : 'ALPHA_VANTAGE_EVENTS_CACHE_TTL_HOURS';
  const fallback = kind === 'news' ? 6 : 24;
  const raw = Number(process.env[envName] ?? String(fallback));
  const hours = Number.isFinite(raw) && raw >= 1 ? raw : fallback;
  return Math.min(hours, 72) * 60 * 60 * 1000;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(current.trim()); current = '';
    } else current += char;
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return value;
  const [, y, m, d, hh, mm, ss] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}

export class AlphaVantageInsightsProvider {
  readonly id = 'alpha-vantage-insights';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('ALPHA_VANTAGE_API_KEY is required');
  }

  async getNews(symbol: string): Promise<NewsInsight[]> {
    const key = symbol.trim().toUpperCase();
    const cached = newsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const existing = newsInFlight.get(key);
    if (existing) return existing;
    const task = this.fetchNews(key).then((value) => {
      newsCache.set(key, { value, expiresAt: Date.now() + ttlMs('news') });
      return value;
    }).finally(() => newsInFlight.delete(key));
    newsInFlight.set(key, task);
    return task;
  }

  async getEarnings(symbol: string): Promise<EarningsEvent[]> {
    const key = symbol.trim().toUpperCase();
    const cached = earningsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const existing = earningsInFlight.get(key);
    if (existing) return existing;
    const task = this.fetchEarnings(key).then((value) => {
      earningsCache.set(key, { value, expiresAt: Date.now() + ttlMs('earnings') });
      return value;
    }).finally(() => earningsInFlight.delete(key));
    earningsInFlight.set(key, task);
    return task;
  }

  private async fetchNews(symbol: string): Promise<NewsInsight[]> {
    const params = new URLSearchParams({ function: 'NEWS_SENTIMENT', tickers: symbol, limit: '20', apikey: this.apiKey });
    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Alpha Vantage HTTP ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    if (typeof raw.Note === 'string') throw new Error(raw.Note);
    if (typeof raw.Information === 'string') throw new Error(raw.Information);
    const feed = Array.isArray(raw.feed) ? raw.feed : [];
    return feed.slice(0, 12).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title : '';
      const url = typeof row.url === 'string' ? row.url : '';
      if (!title || !url) return [];
      const tickerSentiment = Array.isArray(row.ticker_sentiment)
        ? row.ticker_sentiment.find((entry) => entry && typeof entry === 'object' && String((entry as Record<string, unknown>).ticker).toUpperCase() === symbol)
        : undefined;
      const ts = tickerSentiment as Record<string, unknown> | undefined;
      return [{
        title,
        url,
        source: typeof row.source === 'string' ? row.source : undefined,
        publishedAt: normalizeTimestamp(row.time_published),
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        sentiment: typeof ts?.ticker_sentiment_label === 'string' ? ts.ticker_sentiment_label : typeof row.overall_sentiment_label === 'string' ? row.overall_sentiment_label : undefined,
        relevance: parseNumber(ts?.relevance_score),
      } satisfies NewsInsight];
    });
  }

  private async fetchEarnings(symbol: string): Promise<EarningsEvent[]> {
    const params = new URLSearchParams({ function: 'EARNINGS_CALENDAR', symbol, horizon: '12month', apikey: this.apiKey });
    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Alpha Vantage HTTP ${response.status}`);
    const text = await response.text();
    if (text.startsWith('{')) {
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (typeof raw.Note === 'string') throw new Error(raw.Note);
      if (typeof raw.Information === 'string') throw new Error(raw.Information);
    }
    return parseCsv(text).flatMap((row) => {
      const reportDate = row.reportDate || row.report_date || '';
      if (!reportDate) return [];
      return [{
        symbol: row.symbol || symbol,
        name: row.name || undefined,
        reportDate,
        fiscalDateEnding: row.fiscalDateEnding || row.fiscal_date_ending || undefined,
        estimate: parseNumber(row.estimate),
        currency: row.currency || undefined,
      } satisfies EarningsEvent];
    }).slice(0, 8);
  }
}

export function getInsightsProvider(): AlphaVantageInsightsProvider | null {
  const key = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  return key ? new AlphaVantageInsightsProvider(key) : null;
}
