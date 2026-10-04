interface IolTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface TokenCache {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

let sharedTokenCache: TokenCache | null = null;

export class IolApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private async requestToken(body: URLSearchParams): Promise<TokenCache> {
    const response = await fetch(new URL('/token', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`IOL authentication error: HTTP ${response.status}`);
    const payload = await response.json() as IolTokenResponse;
    if (!payload.access_token) throw new Error('IOL authentication response did not include access_token');

    const expiresIn = Math.max(60, Number(payload.expires_in ?? 900));
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + expiresIn * 1000 - 60_000,
    };
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && sharedTokenCache && Date.now() < sharedTokenCache.expiresAt) {
      return sharedTokenCache.accessToken;
    }

    if (sharedTokenCache?.refreshToken) {
      try {
        sharedTokenCache = await this.requestToken(new URLSearchParams({
          refresh_token: sharedTokenCache.refreshToken,
          grant_type: 'refresh_token',
        }));
        return sharedTokenCache.accessToken;
      } catch {
        sharedTokenCache = null;
      }
    }

    sharedTokenCache = await this.requestToken(new URLSearchParams({
      username: this.username,
      password: this.password,
      grant_type: 'password',
    }));
    return sharedTokenCache.accessToken;
  }

  async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const execute = async (forceRefresh: boolean) => {
      const token = await this.accessToken(forceRefresh);
      return fetch(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
    };

    let response = await execute(false);
    if (response.status === 401) {
      sharedTokenCache = null;
      response = await execute(true);
    }

    if (!response.ok) throw new Error(`IOL API error ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
}

export function getIolApiClient(): IolApiClient | null {
  const username = process.env.IOL_API_USERNAME?.trim();
  const password = process.env.IOL_API_PASSWORD?.trim();
  if (!username || !password) return null;
  return new IolApiClient(
    process.env.IOL_API_BASE_URL?.trim() || 'https://api.invertironline.com',
    username,
    password,
  );
}

export function resetIolTokenCacheForTests() {
  sharedTokenCache = null;
}
