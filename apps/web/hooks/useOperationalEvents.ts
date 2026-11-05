'use client';

import { useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { OperationalEvent, ListOperationalEventsFilter } from '@/lib/api/types';
import { useLivePolling, type UseLivePollingResult } from './useLivePolling';

export interface UseOperationalEventsOptions {
  filters?: ListOperationalEventsFilter;
  intervalMs?: number;
  enabled?: boolean;
}

export function useOperationalEvents(
  options: UseOperationalEventsOptions = {},
): UseLivePollingResult<OperationalEvent[]> {
  const { filters, intervalMs = 20000, enabled = true } = options;
  const filterKey = JSON.stringify(filters);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      return apiClient.listOperationalEvents(filters, signal);
    },
    [filterKey, filters],
  );

  return useLivePolling<OperationalEvent[]>(fetcher, {
    intervalMs,
    enabled,
    initialData: undefined,
  });
}
