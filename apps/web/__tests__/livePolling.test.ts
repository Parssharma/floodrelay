import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClientError } from '../lib/api/errors';

// Testable state machine isolating the exact logic of useLivePolling
interface PollingHarnessState<T> {
  data: T | undefined;
  status: string;
  lastUpdated: Date | null;
  error: Error | null;
  backoffDelay: number;
  seq: number;
  isPolling: boolean;
  intervalMs: number;
  maxBackoffMs: number;
  enabled: boolean;
  pauseWhenHidden: boolean;
  isDocumentHidden: boolean;
}

function createPollingHarness<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: {
    intervalMs?: number;
    maxBackoffMs?: number;
    enabled?: boolean;
    pauseWhenHidden?: boolean;
    initialData?: T;
  } = {},
) {
  const state: PollingHarnessState<T> = {
    data: options.initialData,
    status: options.initialData !== undefined ? 'UP_TO_DATE' : 'INITIAL_LOADING',
    lastUpdated: options.initialData !== undefined ? new Date() : null,
    error: null,
    backoffDelay: options.intervalMs || 20000,
    seq: 0,
    isPolling: false,
    intervalMs: options.intervalMs || 20000,
    maxBackoffMs: options.maxBackoffMs || 60000,
    enabled: options.enabled !== undefined ? options.enabled : true,
    pauseWhenHidden: options.pauseWhenHidden !== undefined ? options.pauseWhenHidden : true,
    isDocumentHidden: false,
  };

  let activeController: AbortController | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const abortInFlight = () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  };

  const executePoll = async (isManual = false): Promise<void> => {
    if (!state.enabled) return;
    if (state.isPolling) return; // Prevent overlapping

    clearTimer();
    abortInFlight();

    const controller = new AbortController();
    activeController = controller;
    state.isPolling = true;
    const currentSeq = ++state.seq;

    if (state.data === undefined) {
      state.status = 'INITIAL_LOADING';
    } else {
      state.status = 'REFRESHING';
    }

    try {
      const result = await fetcher(controller.signal);

      // Discard stale
      if (currentSeq !== state.seq) return;

      state.data = result;
      state.lastUpdated = new Date();
      state.error = null;
      state.status = 'UP_TO_DATE';
      state.backoffDelay = state.intervalMs; // Reset backoff
    } catch (err: unknown) {
      if (currentSeq !== state.seq) return;
      if (controller.signal.aborted) return;

      const errorObj = err instanceof Error ? err : new Error(String(err));
      state.error = errorObj;

      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          state.status = 'UNAUTHORIZED';
          return;
        }
        if (err.statusCode === 403) {
          state.status = 'FORBIDDEN';
          return;
        }
        if (err.isNetworkError) {
          state.status = 'OFFLINE';
        } else {
          state.status = 'STALE';
        }
      } else {
        state.status = 'STALE';
      }

      // Exponential backoff
      state.backoffDelay = Math.min(state.backoffDelay * 1.5, state.maxBackoffMs);
    } finally {
      state.isPolling = false;
      activeController = null;

      if (state.enabled && state.status !== 'UNAUTHORIZED' && state.status !== 'FORBIDDEN') {
        if (!state.pauseWhenHidden || !state.isDocumentHidden) {
          clearTimer();
          timerId = setTimeout(
            () => {
              void executePoll(false);
            },
            isManual ? state.intervalMs : state.backoffDelay,
          );
        }
      }
    }
  };

  const refresh = async () => {
    state.backoffDelay = state.intervalMs;
    await executePoll(true);
  };

  const setDocumentHidden = (hidden: boolean) => {
    state.isDocumentHidden = hidden;
    if (hidden && state.pauseWhenHidden) {
      clearTimer();
    } else if (!hidden) {
      void executePoll(false);
    }
  };

  const destroy = () => {
    clearTimer();
    abortInFlight();
  };

  return {
    state,
    executePoll,
    refresh,
    setDocumentHidden,
    destroy,
  };
}

describe('Phase 5 Live Operations — Shared Polling Infrastructure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. performs initial fetch and sets UP_TO_DATE on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(['event-1', 'event-2']);
    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });

    const pollPromise = harness.executePoll();
    expect(harness.state.status).toBe('INITIAL_LOADING');

    await pollPromise;
    expect(harness.state.status).toBe('UP_TO_DATE');
    expect(harness.state.data).toEqual(['event-1', 'event-2']);
    expect(harness.state.lastUpdated).not.toBeNull();
  });

  it('2. triggers automatic refresh when poll interval elapses', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      return [`data-${callCount}`];
    });

    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });
    await harness.executePoll();
    expect(harness.state.data).toEqual(['data-1']);

    // Advance timers by 20s
    await vi.advanceTimersByTimeAsync(20000);
    expect(harness.state.data).toEqual(['data-2']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('3. stops polling and cancels in-flight timer on destroy / unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue(['data']);
    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });

    await harness.executePoll();
    expect(fetcher).toHaveBeenCalledTimes(1);

    harness.destroy();
    await vi.advanceTimersByTimeAsync(40000);
    expect(fetcher).toHaveBeenCalledTimes(1); // No new calls
  });

  it('4. prevents duplicate overlapping polling calls', async () => {
    let resolveFirst!: (val: string[]) => void;
    const slowPromise = new Promise<string[]>((res) => {
      resolveFirst = res;
    });

    const fetcher = vi.fn().mockImplementationOnce(() => slowPromise);
    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });

    // Start slow poll
    const p1 = harness.executePoll();
    expect(harness.state.isPolling).toBe(true);

    // Attempt second poll while first is in-flight
    const p2 = harness.executePoll();
    expect(fetcher).toHaveBeenCalledTimes(1); // Blocked from second invocation

    resolveFirst(['result-1']);
    await p1;
    await p2;
    expect(harness.state.data).toEqual(['result-1']);
  });

  it('5. pauses polling when tab is hidden and resumes when visible', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      return [`visible-${callCount}`];
    });

    const harness = createPollingHarness(fetcher, { intervalMs: 20000, pauseWhenHidden: true });
    await harness.executePoll();
    expect(callCount).toBe(1);

    // Tab hidden
    harness.setDocumentHidden(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(callCount).toBe(1); // Paused while hidden

    // Tab visible again -> triggers immediate refresh
    harness.setDocumentHidden(false);
    expect(callCount).toBe(2);
  });

  it('6. prevents stale responses from overwriting newer data', async () => {
    let resolveFirst!: (val: string[]) => void;
    let resolveSecond!: (val: string[]) => void;

    const p1Promise = new Promise<string[]>((res) => {
      resolveFirst = res;
    });
    const p2Promise = new Promise<string[]>((res) => {
      resolveSecond = res;
    });

    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => p1Promise)
      .mockImplementationOnce(() => p2Promise);

    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });

    // Request 1 starts
    harness.executePoll();

    // Force Request 2 to start (e.g. manual refresh)
    harness.state.isPolling = false; // reset flag for test simulation
    harness.refresh();

    // Request 2 completes FIRST
    resolveSecond(['newer-data']);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.state.data).toEqual(['newer-data']);

    // Request 1 completes LATER
    resolveFirst(['stale-data']);
    await vi.advanceTimersByTimeAsync(0);

    // Data MUST remain the newer data
    expect(harness.state.data).toEqual(['newer-data']);
  });

  it('7. manual refresh resets backoff delay and fetches immediately', async () => {
    const fetcher = vi.fn().mockResolvedValue(['manual-data']);
    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });
    harness.state.backoffDelay = 45000;

    await harness.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(harness.state.data).toEqual(['manual-data']);
    expect(harness.state.backoffDelay).toBe(20000);
  });

  it('8. preserves last successful data during temporary network failure', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(['good-data-1'])
      .mockRejectedValueOnce(
        new ApiClientError({ message: 'Gateway timeout', statusCode: 504, code: 'TIMEOUT' }),
      );

    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });
    await harness.executePoll();
    expect(harness.state.data).toEqual(['good-data-1']);
    expect(harness.state.status).toBe('UP_TO_DATE');

    // Trigger failure on next poll
    await vi.advanceTimersByTimeAsync(20000);
    // Data MUST be preserved!
    expect(harness.state.data).toEqual(['good-data-1']);
    expect(harness.state.status).toBe('STALE');
    expect(harness.state.error?.message).toBe('Gateway timeout');
  });

  it('9. terminates privileged polling on HTTP 401 UNAUTHORIZED', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError({ message: 'Session expired', statusCode: 401, code: 'UNAUTHORIZED' }),
      );

    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });
    await harness.executePoll();

    expect(harness.state.status).toBe('UNAUTHORIZED');
    // Ensure timer is not scheduled
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('10. terminates privileged polling on HTTP 403 FORBIDDEN', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError({ message: 'Forbidden action', statusCode: 403, code: 'FORBIDDEN' }),
      );

    const harness = createPollingHarness(fetcher, { intervalMs: 20000 });
    await harness.executePoll();

    expect(harness.state.status).toBe('FORBIDDEN');
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('11. applies bounded exponential backoff on repeated failures', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiClientError({ message: 'Down', statusCode: 500, code: 'INTERNAL_ERROR' }),
      );

    const harness = createPollingHarness(fetcher, {
      intervalMs: 10000,
      maxBackoffMs: 30000,
    });

    await harness.executePoll();
    expect(harness.state.backoffDelay).toBe(15000); // 10000 * 1.5

    await harness.executePoll();
    expect(harness.state.backoffDelay).toBe(22500); // 15000 * 1.5

    await harness.executePoll();
    expect(harness.state.backoffDelay).toBe(30000); // Capped at maxBackoffMs

    await harness.executePoll();
    expect(harness.state.backoffDelay).toBe(30000);
  });
});
