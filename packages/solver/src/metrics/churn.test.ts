import { describe, expect, it } from 'vitest';
import type { SolverPlan } from '@floodrelay/shared';
import { calculateIncrementalChurn } from './churn.js';

describe('calculateIncrementalChurn', () => {
  const dummyMetrics = {
    coveragePercent: 100,
    totalTravelTimeMinutes: 60,
    totalTravelDistanceKm: 30,
    highPriorityWaitTimeMinutes: 10,
    solveDurationMs: 5,
    servedRequestsCount: 2,
    unservedRequestsCount: 0,
  };

  const baselinePlan: SolverPlan = {
    scenarioId: 'test-scenario',
    calculatedAt: new Date().toISOString(),
    routes: [
      {
        resourceId: 'res-1',
        totalTravelDistanceKm: 15,
        totalDurationMinutes: 30,
        servedRequestIds: ['req-1'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-1',
            lat: 28.5,
            lng: 77.2,
            passengersPickedUp: 2,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 10,
            isFrozen: false,
          },
          {
            stopNumber: 2,
            type: 'DROPOFF',
            targetId: 'shelter-1',
            lat: 28.55,
            lng: 77.25,
            passengersPickedUp: 0,
            passengersDroppedOff: 2,
            estimatedArrivalMinutes: 30,
            isFrozen: false,
          },
        ],
      },
      {
        resourceId: 'res-2',
        totalTravelDistanceKm: 15,
        totalDurationMinutes: 30,
        servedRequestIds: ['req-2'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-2',
            lat: 28.6,
            lng: 77.3,
            passengersPickedUp: 3,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 12,
            isFrozen: false,
          },
          {
            stopNumber: 2,
            type: 'DROPOFF',
            targetId: 'shelter-1',
            lat: 28.55,
            lng: 77.25,
            passengersPickedUp: 0,
            passengersDroppedOff: 3,
            estimatedArrivalMinutes: 30,
            isFrozen: false,
          },
        ],
      },
    ],
    unserved: [],
    metrics: dummyMetrics,
  };

  it('reports zero churn for identical plans', () => {
    const churn = calculateIncrementalChurn(baselinePlan, baselinePlan);
    expect(churn.comparableExistingAssignments).toBe(2);
    expect(churn.reassignedRequestsCount).toBe(0);
    expect(churn.newlyUnservedRequestsCount).toBe(0);
    expect(churn.reorderedStopsCount).toBe(0);
    expect(churn.newlyServedRequestsCount).toBe(0);
    expect(churn.assignmentChurnRate).toBe(0);
    expect(churn.churnPercent).toBe(0);
    expect(churn.frozenStopsViolated).toBe(0);
    expect(churn.travelTimeDeltaMinutes).toBe(0);
  });

  it('detects a single reassigned request between resources', () => {
    const updatedPlan: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 25,
          totalDurationMinutes: 50,
          servedRequestIds: ['req-1', 'req-2'],
          stops: [
            ...baselinePlan.routes[0]!.stops.slice(0, 1),
            {
              stopNumber: 2,
              type: 'PICKUP',
              targetId: 'req-2',
              lat: 28.6,
              lng: 77.3,
              passengersPickedUp: 3,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 25,
              isFrozen: false,
            },
            {
              stopNumber: 3,
              type: 'DROPOFF',
              targetId: 'shelter-1',
              lat: 28.55,
              lng: 77.25,
              passengersPickedUp: 0,
              passengersDroppedOff: 5,
              estimatedArrivalMinutes: 50,
              isFrozen: false,
            },
          ],
        },
      ],
      metrics: {
        ...dummyMetrics,
        totalTravelTimeMinutes: 50,
      },
    };

    const churn = calculateIncrementalChurn(baselinePlan, updatedPlan);
    expect(churn.comparableExistingAssignments).toBe(2);
    expect(churn.reassignedRequestsCount).toBe(1);
    expect(churn.reassignedRequestIds).toEqual(['req-2']);
    expect(churn.newlyUnservedRequestsCount).toBe(0);
    expect(churn.assignmentChurnRate).toBe(0.5);
    expect(churn.churnPercent).toBe(50);
  });

  it('detects mutable stop reordering within the same resource without counting as reassigned churn', () => {
    const multiStopBase: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 20,
          totalDurationMinutes: 40,
          servedRequestIds: ['req-1', 'req-2'],
          stops: [
            {
              stopNumber: 1,
              type: 'PICKUP',
              targetId: 'req-1',
              lat: 28.5,
              lng: 77.2,
              passengersPickedUp: 1,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 10,
              isFrozen: false,
            },
            {
              stopNumber: 2,
              type: 'PICKUP',
              targetId: 'req-2',
              lat: 28.52,
              lng: 77.22,
              passengersPickedUp: 1,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 20,
              isFrozen: false,
            },
            {
              stopNumber: 3,
              type: 'DROPOFF',
              targetId: 'shelter-1',
              lat: 28.55,
              lng: 77.25,
              passengersPickedUp: 0,
              passengersDroppedOff: 2,
              estimatedArrivalMinutes: 40,
              isFrozen: false,
            },
          ],
        },
      ],
    };

    // Swap pickup order
    const reorderedPlan: SolverPlan = {
      ...multiStopBase,
      routes: [
        {
          ...multiStopBase.routes[0]!,
          stops: [
            {
              stopNumber: 1,
              type: 'PICKUP',
              targetId: 'req-2',
              lat: 28.52,
              lng: 77.22,
              passengersPickedUp: 1,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 10,
              isFrozen: false,
            },
            {
              stopNumber: 2,
              type: 'PICKUP',
              targetId: 'req-1',
              lat: 28.5,
              lng: 77.2,
              passengersPickedUp: 1,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 20,
              isFrozen: false,
            },
            {
              stopNumber: 3,
              type: 'DROPOFF',
              targetId: 'shelter-1',
              lat: 28.55,
              lng: 77.25,
              passengersPickedUp: 0,
              passengersDroppedOff: 2,
              estimatedArrivalMinutes: 40,
              isFrozen: false,
            },
          ],
        },
      ],
    };

    const churn = calculateIncrementalChurn(multiStopBase, reorderedPlan);
    expect(churn.comparableExistingAssignments).toBe(2);
    expect(churn.reassignedRequestsCount).toBe(0); // Not reassigned to a different vehicle
    expect(churn.reorderedStopsCount).toBe(2); // Sequence altered
    expect(churn.assignmentChurnRate).toBe(0); // Only reassignments & dropped work count in disruption rate
  });

  it('treats a newly inserted request as newlyServed without inflating existing churn', () => {
    const withNewReqPlan: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          ...baselinePlan.routes[0]!,
          servedRequestIds: ['req-1', 'req-new'],
          stops: [
            baselinePlan.routes[0]!.stops[0]!,
            {
              stopNumber: 2,
              type: 'PICKUP',
              targetId: 'req-new',
              lat: 28.52,
              lng: 77.22,
              passengersPickedUp: 1,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 15,
              isFrozen: false,
            },
            {
              stopNumber: 3,
              type: 'DROPOFF',
              targetId: 'shelter-1',
              lat: 28.55,
              lng: 77.25,
              passengersPickedUp: 0,
              passengersDroppedOff: 3,
              estimatedArrivalMinutes: 35,
              isFrozen: false,
            },
          ],
        },
        baselinePlan.routes[1]!,
      ],
    };

    const churn = calculateIncrementalChurn(baselinePlan, withNewReqPlan);
    expect(churn.comparableExistingAssignments).toBe(2);
    expect(churn.reassignedRequestsCount).toBe(0);
    expect(churn.newlyServedRequestsCount).toBe(1);
    expect(churn.newlyServedRequestIds).toEqual(['req-new']);
    expect(churn.assignmentChurnRate).toBe(0);
  });

  it('detects a removed mutable request as newlyUnserved and counts toward churn', () => {
    const withRemovedPlan: SolverPlan = {
      ...baselinePlan,
      routes: [baselinePlan.routes[0]!], // res-2 route dropped
      unserved: [{ requestId: 'req-2', reason: 'CAPACITY_EXCEEDED' }],
    };

    const churn = calculateIncrementalChurn(baselinePlan, withRemovedPlan);
    expect(churn.comparableExistingAssignments).toBe(2);
    expect(churn.reassignedRequestsCount).toBe(0);
    expect(churn.newlyUnservedRequestsCount).toBe(1);
    expect(churn.newlyUnservedRequestIds).toEqual(['req-2']);
    expect(churn.assignmentChurnRate).toBe(0.5);
    expect(churn.churnPercent).toBe(50);
  });

  it('handles empty baseline plans with zero denominator safely', () => {
    const emptyPlan: SolverPlan = {
      scenarioId: 'empty',
      calculatedAt: new Date().toISOString(),
      routes: [],
      unserved: [],
      metrics: {
        coveragePercent: 100,
        totalTravelTimeMinutes: 0,
        totalTravelDistanceKm: 0,
        highPriorityWaitTimeMinutes: 0,
        solveDurationMs: 0,
        servedRequestsCount: 0,
        unservedRequestsCount: 0,
      },
    };

    const churn = calculateIncrementalChurn(emptyPlan, baselinePlan);
    expect(churn.comparableExistingAssignments).toBe(0);
    expect(churn.assignmentChurnRate).toBe(0);
    expect(churn.churnPercent).toBe(0);
    expect(churn.newlyServedRequestsCount).toBe(2);
  });

  it('detects and reports frozen-stop violations', () => {
    const frozenBase: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          ...baselinePlan.routes[0]!,
          stops: [
            { ...baselinePlan.routes[0]!.stops[0]!, isFrozen: true },
            baselinePlan.routes[0]!.stops[1]!,
          ],
        },
      ],
    };

    // In updated plan, req-1 is removed or changed
    const violatedPlan: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 0,
          totalDurationMinutes: 0,
          servedRequestIds: [],
          stops: [],
        },
      ],
    };

    const churn = calculateIncrementalChurn(frozenBase, violatedPlan);
    expect(churn.frozenStopsViolated).toBe(1);
  });
});
