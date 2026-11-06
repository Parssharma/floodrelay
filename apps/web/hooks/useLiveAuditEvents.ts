'use client';

import { useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { AuditEventRecord, ListAuditEventsFilter } from '@/lib/api/types';
import { useLivePolling, type UseLivePollingResult } from './useLivePolling';

export interface UseLiveAuditEventsOptions {
  filters?: ListAuditEventsFilter;
  intervalMs?: number;
  enabled?: boolean;
}

export function useLiveAuditEvents(
  options: UseLiveAuditEventsOptions = {},
): UseLivePollingResult<AuditEventRecord[]> {
  const { filters, intervalMs = 20000, enabled = true } = options;
  const filterKey = JSON.stringify(filters);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      return apiClient.listAuditEvents(filters, signal);
    },
    [filterKey, filters],
  );

  return useLivePolling<AuditEventRecord[]>(fetcher, {
    intervalMs,
    enabled,
    initialData: undefined,
  });
}
