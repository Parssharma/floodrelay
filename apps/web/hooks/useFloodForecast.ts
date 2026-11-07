'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FloodForecastContext } from '@floodrelay/shared';
import { apiClient } from '@/lib/api/client';

export type ForecastStatus = 'INITIAL_LOADING' | 'READY' | 'STALE' | 'ERROR';

export interface UseFloodForecastOptions {
  lat?: number;
  lng?: number;
  days?: number;
  autoFetch?: boolean;
}

export function useFloodForecast(options?: UseFloodForecastOptions) {
  const [data, setData] = useState<FloodForecastContext | null>(null);
  const [status, setStatus] = useState<ForecastStatus>('INITIAL_LOADING');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isFetchingRef = useRef(false);

  const fetchForecast = useCallback(
    async (forceRefresh = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        const result = await apiClient.getFloodForecast({
          lat: options?.lat,
          lng: options?.lng,
          days: options?.days,
          forceRefresh,
        });

        setData(result);
        setStatus(result.freshness === 'STALE' ? 'STALE' : 'READY');
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch flood forecast context');
        setStatus((prev) => (prev === 'INITIAL_LOADING' ? 'ERROR' : 'STALE'));
      } finally {
        isFetchingRef.current = false;
      }
    },
    [options?.lat, options?.lng, options?.days],
  );

  useEffect(() => {
    if (options?.autoFetch !== false) {
      fetchForecast();
    }
  }, [fetchForecast, options?.autoFetch]);

  return {
    data,
    status,
    error,
    lastUpdated,
    refresh: fetchForecast,
    isFresh: data?.freshness === 'FRESH' || data?.freshness === 'CACHED',
    isOfflineFixture: data?.freshness === 'OFFLINE_FIXTURE',
  };
}
