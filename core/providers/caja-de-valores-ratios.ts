import type {
  CedearRatioProvider,
  CedearRatioRecord,
} from '@/core/providers/cedear-provider-contracts';

interface RatioCache {
  expiresAt: number;
  records: CedearRatioRecord[];
}

let cache: RatioCache | null = null;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFromCell(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function parseCedearRatio(value: string): number | undefined {
  const normalized = value.replace(',', '.').trim();
  const ratioMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    const numerator = Number(ratioMatch[1]);
    const denominator = Number(ratioMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > 0 && denominator > 0) {
      return numerator / denominator;
    }
  }

  const numeric = Number(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

export function parseCajaCedearHtml(html: string, fetchedAt = new Date().toISOString()): CedearRatioRecord[] {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const records: CedearRatioRecord[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => textFromCell(match[1]));
    if (cells.length < 9) continue;

    // Caja de Valores uses the same leading layout for CEDEAR shares and ETFs:
    // 0 denomination, 1 BYMA symbol, 2 origin ticker, ... 8 ratio.
    const symbol = cells[1]?.replace(/\s+/g, '').toUpperCase();
    const underlyingSymbol = cells[2]?.replace(/\s+/g, '').toUpperCase();
    const ratio = parseCedearRatio(cells[8] ?? '');

    if (!symbol || !underlyingSymbol || !ratio) continue;
    if (!/^[A-Z0-9.\-]+$/.test(symbol) || !/^[A-Z0-9.\-]+$/.test(underlyingSymbol)) continue;

    records.push({
      symbol,
      underlyingSymbol,
      cedearsPerUnderlyingShare: ratio,
      updatedAt: fetchedAt,
      source: 'caja-de-valores',
    });
  }

  const deduplicated = new Map<string, CedearRatioRecord>();
  for (const record of records) deduplicated.set(record.symbol, record);
  return [...deduplicated.values()];
}

export class CajaDeValoresRatioProvider implements CedearRatioProvider {
  readonly id = 'caja-de-valores';

  constructor(
    private readonly url = 'https://cajadevalores.com.ar/Servicios/Cedears',
    private readonly cacheTtlMs = 6 * 60 * 60 * 1000,
  ) {}

  private async allRatios(): Promise<CedearRatioRecord[]> {
    if (cache && Date.now() < cache.expiresAt) return cache.records;

    const response = await fetch(this.url, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Caja de Valores CEDEAR list error: HTTP ${response.status}`);

    const fetchedAt = new Date().toISOString();
    const records = parseCajaCedearHtml(await response.text(), fetchedAt);
    if (!records.length) throw new Error('Caja de Valores CEDEAR list returned no parseable ratio records');

    cache = {
      expiresAt: Date.now() + this.cacheTtlMs,
      records,
    };
    return records;
  }

  async getRatios(symbols: string[]): Promise<CedearRatioRecord[]> {
    const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    return (await this.allRatios()).filter((record) => requested.has(record.symbol));
  }
}

export function resetCajaRatioCacheForTests() {
  cache = null;
}
