import type { NewsInsight } from '@/core/providers/alpha-vantage-insights';

type CacheEntry = { expiresAt: number; value: string };
const translationCache = new Map<string, CacheEntry>();

function cacheTtlMs() {
  const raw = Number(process.env.NEWS_TRANSLATION_CACHE_TTL_HOURS ?? '24');
  const hours = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 168) : 24;
  return hours * 60 * 60 * 1000;
}

function truncateUtf8(text: string, maxBytes = 480) {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let output = '';
  for (const char of text) {
    const candidate = output + char;
    if (encoder.encode(candidate).length > maxBytes) break;
    output = candidate;
  }
  return output.trim();
}

async function translateTextToSpanish(text: string): Promise<string> {
  const source = text.trim();
  if (!source) return source;
  const cacheKey = `en|es:${source}`;
  const cached = translationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({
    q: truncateUtf8(source),
    langpair: 'en|es',
    mt: '1',
  });
  const apiKey = process.env.MYMEMORY_API_KEY?.trim();
  if (apiKey) params.set('key', apiKey);

  const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);

  const raw = await response.json() as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };
  const translated = raw.responseData?.translatedText?.trim();
  if (!translated || (raw.responseStatus && raw.responseStatus >= 400)) throw new Error('Traducción no disponible');

  translationCache.set(cacheKey, { value: translated, expiresAt: Date.now() + cacheTtlMs() });
  return translated;
}

export async function translateNewsToSpanish(items: NewsInsight[], limit = 6): Promise<NewsInsight[]> {
  const capped = Math.max(0, Math.min(limit, items.length));
  const translated = await Promise.all(items.slice(0, capped).map(async (item) => {
    try {
      const translatedTitle = await translateTextToSpanish(item.title);
      return {
        ...item,
        originalTitle: item.title,
        title: translatedTitle,
        translatedTitle,
        translationLanguage: 'es' as const,
      };
    } catch {
      return item;
    }
  }));
  return [...translated, ...items.slice(capped)];
}
