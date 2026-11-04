import { describe, expect, it } from 'vitest';
import type { SolverPlan } from '@floodrelay/shared';
import { extractFrozenStops, validateFrozenStopsPreserved } from './frozenStops.js';

describe('Frozen Stops Preservation', () => {
  const dummyMetrics = {
    coveragePercent: 100,
    totalTravelTimeMinutes: 40,
    totalTravelDistanceKm: 20,
    highPriorityWaitTimeMinutes: 5,
    solveDurationMs: 2,
    servedRequestsCount: 2,
    unservedRequestsCount: 0,
  };

  const baselinePlan: SolverPlan = {
    scenarioId: 'frozen-test-scenario',
    calculatedAt: new Date().toISOString(),
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
            passengersPickedUp: 2,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 10,
            isFrozen: true,
          },
          {
            stopNumber: 2,
            type: 'DROPOFF',
            targetId: 'shelter-1',
            lat: 28.55,
            lng: 77.25,
            passengersPickedUp: 0,
            passengersDroppedOff: 2,
            estimatedArrivalMinutes: 25,
            isFrozen: true,
          },
          {
            stopNumber: 3,
            type: 'PICKUP',
            targetId: 'req-2',
            lat: 28.56,
            lng: 77.26,
            passengersPickedUp: 1,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 30,
            isFrozen: false, // mutable
          },
          {
            stopNumber: 4,
            type: 'DROPOFF',
            targetId: 'shelter-1',
            lat: 28.55,
            lng: 77.25,
            passengersPickedUp: 0,
            passengersDroppedOff: 1,
            estimatedArrivalMinutes: 40,
            isFrozen: false, // mutable
          },
        ],
      },
    ],
    unserved: [],
    metrics: dummyMetrics,
  };

  it('correctly extracts frozen stops', () => {
    const frozen = extractFrozenStops(baselinePlan);
    expect(frozen.length).toBe(2);
    expect(frozen[0]!.targetId).toBe('req-1');
    expect(frozen[0]!.isFrozen).toBe(true);
    expect(frozen[1]!.targetId).toBe('shelter-1');
  });

  it('passes validation when all frozen stops are strictly preserved', () => {
    // Valid candidate plan: mutable stops altered, frozen prefix preserved
    const candidatePlan: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 22,
          totalDurationMinutes: 45,
          servedRequestIds: ['req-1', 'req-3'],
          stops: [
            baselinePlan.routes[0]!.stops[0]!, // frozen req-1
            baselinePlan.routes[0]!.stops[1]!, // frozen shelter-1
            {
              stopNumber: 3,
              type: 'PICKUP',
              targetId: 'req-3',
              lat: 28.58,
              lng: 77.28,
              passengersPickedUp: 2,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 32,
              isFrozen: false,
            },
            {
              stopNumber: 4,
              type: 'DROPOFF',
              targetId: 'shelter-1',
              lat: 28.55,
              lng: 77.25,
              passengersPickedUp: 0,
              passengersDroppedOff: 2,
              estimatedArrivalMinutes: 45,
              isFrozen: false,
            },
          ],
        },
      ],
    };

    const res = validateFrozenStopsPreserved(baselinePlan, candidatePlan);
    expect(res.valid).toBe(true);
    expect(res.violationsCount).toBe(0);
    expect(res.errors).toEqual([]);
  });

  it('rejects candidate plan if a frozen stop is removed', () => {
    const badCandidate: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 10,
          totalDurationMinutes: 20,
          servedRequestIds: ['req-2'],
          stops: [baselinePlan.routes[0]!.stops[2]!, baselinePlan.routes[0]!.stops[3]!],
        },
      ],
    };

    const res = validateFrozenStopsPreserved(baselinePlan, badCandidate);
    expect(res.valid).toBe(false);
    expect(res.violationsCount).toBeGreaterThan(0);
  });

  it('rejects candidate plan if a frozen stop is reassigned to another resource', () => {
    const stolenCandidate: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          resourceId: 'res-1',
          totalTravelDistanceKm: 0,
          totalDurationMinutes: 0,
          servedRequestIds: [],
          stops: [],
        },
        {
          resourceId: 'res-2',
          totalTravelDistanceKm: 20,
          totalDurationMinutes: 40,
          servedRequestIds: ['req-1'],
          stops: [baselinePlan.routes[0]!.stops[0]!, baselinePlan.routes[0]!.stops[1]!],
        },
      ],
    };

    const res = validateFrozenStopsPreserved(baselinePlan, stolenCandidate);
    expect(res.valid).toBe(false);
    expect(res.violationsCount).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.includes('reassigned'))).toBe(true);
  });

  it('rejects candidate plan if a frozen stop has its isFrozen flag cleared', () => {
    const unfrozenCandidate: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          ...baselinePlan.routes[0]!,
          stops: [
            { ...baselinePlan.routes[0]!.stops[0]!, isFrozen: false }, // illegally unfrozen!
            baselinePlan.routes[0]!.stops[1]!,
            baselinePlan.routes[0]!.stops[2]!,
            baselinePlan.routes[0]!.stops[3]!,
          ],
        },
      ],
    };

    const res = validateFrozenStopsPreserved(baselinePlan, unfrozenCandidate);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('unfrozen'))).toBe(true);
  });

  it('rejects candidate plan if relative sequence between frozen stops is reversed', () => {
    const reversedCandidate: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          ...baselinePlan.routes[0]!,
          stops: [
            baselinePlan.routes[0]!.stops[1]!, // shelter before pickup!
            baselinePlan.routes[0]!.stops[0]!,
          ],
        },
      ],
    };

    const res = validateFrozenStopsPreserved(baselinePlan, reversedCandidate);
    expect(res.valid).toBe(false);
  });
});
