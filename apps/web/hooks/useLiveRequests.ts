'use client';

import { useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { RescueRequest, ListRequestsFilter } from '@/lib/api/types';
import { useLivePolling, type UseLivePollingResult } from './useLivePolling';

export interface UseLiveRequestsOptions {
  filters?: ListRequestsFilter;
  intervalMs?: number;
  enabled?: boolean;
}

export function useLiveRequests(
  options: UseLiveRequestsOptions = {},
): UseLivePollingResult<RescueRequest[]> {
  const { filters, intervalMs = 20000, enabled = true } = options;
  const filterKey = JSON.stringify(filters);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      return apiClient.listRequests(filters, signal);
    },
    [filterKey, filters],
  );

  return useLivePolling<RescueRequest[]>(fetcher, {
    intervalMs,
    enabled,
    initialData: undefined,
  });
}
