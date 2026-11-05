'use client';

import { useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { AssignmentRecord } from '@/lib/api/types';
import { useLivePolling, type UseLivePollingResult } from './useLivePolling';

export interface UseLiveAssignmentsOptions {
  filters?: {
    status?: 'PROPOSED' | 'COMMITTED';
    scenarioId?: string;
    limit?: number;
    offset?: number;
  };
  intervalMs?: number;
  enabled?: boolean;
}

export function useLiveAssignments(
  options: UseLiveAssignmentsOptions = {},
): UseLivePollingResult<AssignmentRecord[]> {
  const { filters, intervalMs = 20000, enabled = true } = options;
  const filterKey = JSON.stringify(filters);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      return apiClient.listAssignments(filters, signal);
    },
    [filterKey, filters],
  );

  return useLivePolling<AssignmentRecord[]>(fetcher, {
    intervalMs,
    enabled,
    initialData: undefined,
  });
}
