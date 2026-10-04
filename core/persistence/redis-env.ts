export interface RedisRestConfig {
  restUrl: string;
  token: string;
  source: 'upstash' | 'vercel-kv';
}

export function getRedisRestConfig(): RedisRestConfig | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    return { restUrl: upstashUrl, token: upstashToken, source: 'upstash' };
  }

  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) {
    return { restUrl: kvUrl, token: kvToken, source: 'vercel-kv' };
  }

  return null;
}
