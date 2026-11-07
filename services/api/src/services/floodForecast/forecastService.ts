import type { FloodForecastContext } from '@floodrelay/shared';
import type { FloodForecastProvider, ForecastQueryOptions } from './types.js';
import { OpenMeteoFloodForecastProvider } from './openMeteoProvider.js';

interface CacheEntry {
  data: FloodForecastContext;
  cachedAt: number;
}

export class ForecastService {
  private readonly provider: FloodForecastProvider;
  private readonly cacheTtlMs: number;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(options?: { provider?: FloodForecastProvider; cacheTtlMs?: number }) {
    this.provider = options?.provider ?? new OpenMeteoFloodForecastProvider();
    this.cacheTtlMs = options?.cacheTtlMs ?? 60 * 60 * 1000; // 1 hour default
  }

  private getCacheKey(options?: ForecastQueryOptions): string {
    const lat = (options?.lat ?? 28.65).toFixed(2);
    const lng = (options?.lng ?? 77.23).toFixed(2);
    const days = options?.days ?? 7;
    return `${lat}:${lng}:${days}`;
  }

  async getForecastContext(options?: ForecastQueryOptions): Promise<FloodForecastContext> {
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // 1. Return fresh cached copy if within TTL and refresh not requested
    if (cached && !options?.forceRefresh && now - cached.cachedAt < this.cacheTtlMs) {
      return {
        ...cached.data,
        freshness: 'CACHED',
      };
    }

    try {
      // 2. Fetch from upstream provider
      const freshData = await this.provider.getForecast(options);
      this.cache.set(cacheKey, {
        data: freshData,
        cachedAt: now,
      });
      return freshData;
    } catch (err) {
      // 3. Fallback to stale cached data if available
      if (cached) {
        return {
          ...cached.data,
          freshness: 'STALE',
          disclaimer: `${cached.data.disclaimer} (NOTICE: Serving stale cached forecast as upstream update timed out).`,
        };
      }

      // 4. Fallback to deterministic simulated fixture if offline/no cache
      if (this.provider instanceof OpenMeteoFloodForecastProvider) {
        return this.provider.getFallbackFixture(options?.lat, options?.lng, options?.days);
      }

      throw err;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
