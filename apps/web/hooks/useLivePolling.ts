'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClientError } from '@/lib/api/errors';

export type LivePollingStatus =
  | 'INITIAL_LOADING'
  | 'UP_TO_DATE'
  | 'REFRESHING'
  | 'STALE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

export interface UseLivePollingOptions<T> {
  intervalMs?: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  maxBackoffMs?: number;
  initialData?: T;
  staleMultiplier?: number;
  onError?: (err: Error) => void;
  onSuccess?: (data: T) => void;
}

export interface UseLivePollingResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  status: LivePollingStatus;
  lastUpdated: Date | null;
  error: Error | null;
  refresh: () => Promise<void>;
  statusLabel: string;
}

const DEFAULT_INTERVAL_MS = 20000; // 20 seconds default
const DEFAULT_MAX_BACKOFF_MS = 60000; // 60 seconds max backoff

export function useLivePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseLivePollingOptions<T> = {},
): UseLivePollingResult<T> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    enabled = true,
    pauseWhenHidden = true,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    initialData,
    onError,
    onSuccess,
  } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [status, setStatus] = useState<LivePollingStatus>(
    initialData !== undefined ? 'UP_TO_DATE' : 'INITIAL_LOADING',
  );
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    initialData !== undefined ? new Date() : null,
  );

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const abortControllerRef = useRef<AbortController | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const seqRef = useRef<number>(0);
  const backoffDelayRef = useRef<number>(intervalMs);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<T | undefined>(data);
  dataRef.current = data;

  // Cleanup helper
  const clearTimer = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  };

  const abortInFlight = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const executePoll = useCallback(
    async (isManual = false): Promise<void> => {
      if (!enabled) return;

      // Prevent duplicate overlapping requests
      if (isPollingRef.current) {
        return;
      }

      clearTimer();
      abortInFlight();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isPollingRef.current = true;
      const currentSeq = ++seqRef.current;

      const hasExistingData = dataRef.current !== undefined;
      if (!hasExistingData) {
        setStatus('INITIAL_LOADING');
      } else {
        setStatus('REFRESHING');
      }

      try {
        const result = await fetcherRef.current(controller.signal);

        // Discard stale responses if newer poll started
        if (currentSeq !== seqRef.current) {
          return;
        }

        setData(result);
        dataRef.current = result;
        const now = new Date();
        setLastUpdated(now);
        setError(null);
        setStatus('UP_TO_DATE');
        backoffDelayRef.current = intervalMs; // Reset backoff on success
        onSuccessRef.current?.(result);
      } catch (err: unknown) {
        if (currentSeq !== seqRef.current) {
          return;
        }

        // Ignore intentional aborts on unmount or cancellation
        if (controller.signal.aborted) {
          return;
        }

        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        onErrorRef.current?.(errorObj);

        // Check for auth / permission errors
        if (err instanceof ApiClientError) {
          if (err.statusCode === 401) {
            setStatus('UNAUTHORIZED');
            // Stop polling on 401
            return;
          }
          if (err.statusCode === 403) {
            setStatus('FORBIDDEN');
            // Stop polling on 403
            return;
          }
          if (err.isNetworkError) {
            setStatus('OFFLINE');
          } else {
            setStatus('STALE');
          }
        } else {
          setStatus('STALE');
        }

        // Bounded exponential backoff on failure
        backoffDelayRef.current = Math.min(backoffDelayRef.current * 1.5, maxBackoffMs);
      } finally {
        isPollingRef.current = false;
        abortControllerRef.current = null;

        // Schedule next polling cycle if still enabled and not stopped by 401/403
        if (enabled && status !== 'UNAUTHORIZED' && status !== 'FORBIDDEN') {
          // If browser tab is visible, queue next poll
          const isHidden = typeof document !== 'undefined' && document.hidden;
          if (!pauseWhenHidden || !isHidden) {
            clearTimer();
            timeoutIdRef.current = setTimeout(
              () => {
                void executePoll(false);
              },
              isManual ? intervalMs : backoffDelayRef.current,
            );
          }
        }
      }
    },
    [enabled, intervalMs, maxBackoffMs, pauseWhenHidden, status],
  );

  // Manual refresh trigger
  const refresh = useCallback(async (): Promise<void> => {
    backoffDelayRef.current = intervalMs;
    await executePoll(true);
  }, [executePoll, intervalMs]);

  // Handle visibility changes (pause when hidden, resume & refresh on visible)
  useEffect(() => {
    if (typeof document === 'undefined' || !pauseWhenHidden) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: clear upcoming timeout to pause polling
        clearTimer();
      } else {
        // Tab visible again: refresh immediately and resume schedule
        void executePoll(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [executePoll, pauseWhenHidden]);

  // Primary lifecycle effect: start on mount / when enabled changes
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      abortInFlight();
      return;
    }

    void executePoll(false);

    return () => {
      clearTimer();
      abortInFlight();
    };
  }, [enabled, executePoll]);

  // Derived user-facing label
  const statusLabel = (() => {
    switch (status) {
      case 'INITIAL_LOADING':
        return 'Connecting to command center...';
      case 'REFRESHING':
        return 'Refreshing live operations...';
      case 'UP_TO_DATE':
        return 'Live updates active';
      case 'STALE':
        return 'Data may be outdated (retrying...)';
      case 'OFFLINE':
        return 'Connection lost — displaying last verified data';
      case 'UNAUTHORIZED':
        return 'Session expired — re-authentication required';
      case 'FORBIDDEN':
        return 'Access restricted — insufficient role permission';
    }
  })();

  return {
    data,
    isLoading: status === 'INITIAL_LOADING',
    isRefreshing: status === 'REFRESHING',
    status,
    lastUpdated,
    error,
    refresh,
    statusLabel,
  };
}
