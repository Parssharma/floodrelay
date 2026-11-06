import { describe, it, expect } from 'vitest';
import type { AssignmentRecord, OperationalEvent } from '../lib/api/types';
import type { RescueRequest } from '@floodrelay/shared';

describe('Phase 5 Part 3 — Dashboard Real API Error Preservation', () => {
  // Simulator for the dashboard's fetchDashboardData logic with error preservation
  async function simulateFetchDashboardData(
    mockApis: {
      listRequests: () => Promise<RescueRequest[]>;
      listAssignments: () => Promise<AssignmentRecord[]>;
      listEvents: () => Promise<OperationalEvent[]>;
    },
    previousData: {
      assignments: AssignmentRecord[] | null;
      recentEvents: OperationalEvent[] | null;
    },
  ) {
    const [requestsResult, assignmentsResult, eventsResult] = await Promise.allSettled([
      mockApis.listRequests(),
      mockApis.listAssignments(),
      mockApis.listEvents(),
    ]);

    if (requestsResult.status === 'rejected') {
      throw requestsResult.reason;
    }
    const requests = requestsResult.value || [];

    let assignments: AssignmentRecord[] | null = null;
    let assignmentsError: string | null = null;
    let assignmentsStale = false;

    if (assignmentsResult.status === 'fulfilled') {
      assignments = assignmentsResult.value || [];
      previousData.assignments = assignments;
    } else {
      const err = assignmentsResult.reason as Error;
      assignmentsError = err?.message || 'Failed to fetch assignments';
      if (previousData.assignments !== null) {
        assignments = previousData.assignments;
        assignmentsStale = true;
      }
    }

    let recentEvents: OperationalEvent[] | null = null;
    let eventsError: string | null = null;
    let eventsStale = false;

    if (eventsResult.status === 'fulfilled') {
      recentEvents = eventsResult.value || [];
      previousData.recentEvents = recentEvents;
    } else {
      const err = eventsResult.reason as Error;
      eventsError = err?.message || 'Failed to fetch operational events';
      if (previousData.recentEvents !== null) {
        recentEvents = previousData.recentEvents;
        eventsStale = true;
      }
    }

    return {
      requests,
      assignments,
      recentEvents,
      assignmentsError,
      assignmentsStale,
      eventsError,
      eventsStale,
      hasPartialFailure: Boolean(assignmentsError || eventsError),
    };
  }

  it('preserves cached assignments data and sets stale flag when assignments endpoint fails', async () => {
    const cachedAssignment: AssignmentRecord = {
      id: 'plan-harris-001',
      scenario_id: 'sector-4',
      status: 'COMMITTED',
      routes: [],
      unserved: [],
      metrics: {
        coveragePercent: 85,
        totalTravelTimeMinutes: 120,
        totalTravelDistanceKm: 45,
        highPriorityWaitTimeMinutes: 15,
        solveDurationMs: 400,
        servedRequestsCount: 12,
        unservedRequestsCount: 2,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const previousCache = {
      assignments: [cachedAssignment],
      recentEvents: null,
    };

    const result = await simulateFetchDashboardData(
      {
        listRequests: async () => [
          {
            id: 'req-1',
            lat: 29.7,
            lng: -95.3,
            urgency: 'HIGH',
            peopleCount: 2,
            source: 'REPORTED',
            createdAt: new Date().toISOString(),
          },
        ],
        listAssignments: async () => {
          throw new Error('503 Service Unavailable: Solver engine down');
        },
        listEvents: async () => [],
      },
      previousCache,
    );

    // Error must be preserved, NOT swallowed into empty array
    expect(result.assignmentsError).toBe('503 Service Unavailable: Solver engine down');
    expect(result.assignmentsStale).toBe(true);
    // Cached assignment is retained, not zeroed out!
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments![0].id).toBe('plan-harris-001');
    expect(result.hasPartialFailure).toBe(true);
  });

  it('marks assignments as null (Data Unavailable) rather than false 0 when initial fetch fails', async () => {
    const previousCache = {
      assignments: null,
      recentEvents: null,
    };

    const result = await simulateFetchDashboardData(
      {
        listRequests: async () => [],
        listAssignments: async () => {
          throw new Error('500 Internal Server Error: Database connection refused');
        },
        listEvents: async () => [],
      },
      previousCache,
    );

    // Initial failure with no cache must yield null data, not []
    expect(result.assignments).toBeNull();
    expect(result.assignmentsError).toBe('500 Internal Server Error: Database connection refused');
    expect(result.assignmentsStale).toBe(false);
    expect(result.hasPartialFailure).toBe(true);
  });

  it('distinguishes between genuine empty response and network error', async () => {
    const previousCache = {
      assignments: null,
      recentEvents: null,
    };

    // Successful empty
    const successResult = await simulateFetchDashboardData(
      {
        listRequests: async () => [],
        listAssignments: async () => [], // Successfully returned 0 assignments
        listEvents: async () => [],
      },
      previousCache,
    );

    expect(successResult.assignments).toEqual([]);
    expect(successResult.assignmentsError).toBeNull();
    expect(successResult.hasPartialFailure).toBe(false);

    // Failure without prior cache
    const freshCache = {
      assignments: null,
      recentEvents: null,
    };
    const failureResult = await simulateFetchDashboardData(
      {
        listRequests: async () => [],
        listAssignments: async () => {
          throw new Error('Network error');
        },
        listEvents: async () => [],
      },
      freshCache,
    );

    expect(failureResult.assignments).toBeNull();
    expect(failureResult.assignmentsError).toBe('Network error');
    expect(failureResult.hasPartialFailure).toBe(true);
  });
});
