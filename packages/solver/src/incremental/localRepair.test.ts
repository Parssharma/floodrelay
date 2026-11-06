import { describe, expect, it } from 'vitest';
import type { Scenario, SolverPlan } from '@floodrelay/shared';
import { StraightLineTravelTimeProvider } from '../routing/travelTime.js';
import { repairRequestCancellation } from './cancellation.js';
import { repairResourceOffline } from './localRepair.js';

describe('Resource-Offline Local Repair & Request Cancellation', () => {
  const provider = new StraightLineTravelTimeProvider();

  const baseScenario: Scenario = {
    id: 'local-repair-scenario',
    metadata: {
      id: 'local-repair-scenario',
      name: 'Local Repair Test',
      region: 'Delhi',
      createdAt: new Date().toISOString(),
      bounds: { minLat: 28.4, maxLat: 28.7, minLng: 77.1, maxLng: 77.4 },
    },
    requests: [
      {
        id: 'req-1',
        lat: 28.51,
        lng: 77.21,
        peopleCount: 2,
        urgency: 'HIGH',
        createdAt: new Date().toISOString(),
        source: 'SIMULATED',
      },
      {
        id: 'req-2',
        lat: 28.52,
        lng: 77.22,
        peopleCount: 3,
        urgency: 'CRITICAL',
        createdAt: new Date().toISOString(),
        source: 'SIMULATED',
      },
    ],
    resources: [
      {
        id: 'res-A',
        name: 'Boat Alpha',
        type: 'BOAT',
        capacity: 6,
        speedKmH: 25,
        lat: 28.5,
        lng: 77.2,
        status: 'AVAILABLE',
      },
      {
        id: 'res-B',
        name: 'Boat Beta',
        type: 'BOAT',
        capacity: 6,
        speedKmH: 25,
        lat: 28.55,
        lng: 77.25,
        status: 'AVAILABLE',
      },
    ],
    shelters: [
      {
        id: 'shelter-1',
        name: 'Safe Shelter',
        lat: 28.55,
        lng: 77.25,
        capacity: 100,
      },
    ],
  };

  const baselinePlan: SolverPlan = {
    scenarioId: baseScenario.id,
    calculatedAt: new Date().toISOString(),
    routes: [
      {
        resourceId: 'res-A',
        totalTravelDistanceKm: 15,
        totalDurationMinutes: 30,
        servedRequestIds: ['req-1', 'req-2'],
        stops: [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: 'req-1',
            lat: 28.51,
            lng: 77.21,
            passengersPickedUp: 2,
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
            passengersPickedUp: 3,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 18,
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
            estimatedArrivalMinutes: 30,
            isFrozen: false,
          },
        ],
      },
    ],
    unserved: [],
    metrics: {
      coveragePercent: 100,
      totalTravelTimeMinutes: 30,
      totalTravelDistanceKm: 15,
      highPriorityWaitTimeMinutes: 14,
      solveDurationMs: 5,
      servedRequestsCount: 2,
      unservedRequestsCount: 0,
    },
  };

  describe('repairResourceOffline', () => {
    it('identifies offline resource and reassigns eligible mutable requests to available alternative', () => {
      const res = repairResourceOffline('res-A', baseScenario, baselinePlan, provider);

      expect(res.success).toBe(true);
      expect(res.affectedResourceIds).toContain('res-A');
      expect(res.repairedRoutes).toBeDefined();

      // res-A route is gone; res-B picked up the requests
      const routeA = res.repairedRoutes!.find((r) => r.resourceId === 'res-A');
      const routeB = res.repairedRoutes!.find((r) => r.resourceId === 'res-B');
      expect(routeA).toBeUndefined();
      expect(routeB).toBeDefined();
      expect(routeB!.servedRequestIds).toContain('req-1');
      expect(routeB!.servedRequestIds).toContain('req-2');
      expect(res.newlyUnserved.length).toBe(0);
    });

    it('returns requests as unserved when no alternative resource has capacity', () => {
      // res-B has capacity 2 only, but req-2 needs 3 people
      const tightScenario: Scenario = {
        ...baseScenario,
        resources: [
          baseScenario.resources[0]!,
          {
            ...baseScenario.resources[1]!,
            capacity: 2, // cannot fit req-2 (3 people)
          },
        ],
      };

      const res = repairResourceOffline('res-A', tightScenario, baselinePlan, provider);

      expect(res.success).toBe(true);
      expect(res.newlyUnserved.length).toBeGreaterThan(0);
      const unservedReq2 = res.newlyUnserved.find((u) => u.requestId === 'req-2');
      expect(unservedReq2).toBeDefined();
    });

    it('never assigns a request to multiple resources (no duplicate assignments)', () => {
      const res = repairResourceOffline('res-A', baseScenario, baselinePlan, provider);
      expect(res.success).toBe(true);

      const allServed = res.repairedRoutes!.flatMap((r) => r.servedRequestIds);
      const uniqueServed = new Set(allServed);
      expect(allServed.length).toBe(uniqueServed.size);
    });

    it('rejects automatic reassignment if offline resource has committed/frozen work', () => {
      // Mark req-1 as frozen
      const frozenPlan: SolverPlan = {
        ...baselinePlan,
        routes: [
          {
            ...baselinePlan.routes[0]!,
            stops: [
              { ...baselinePlan.routes[0]!.stops[0]!, isFrozen: true },
              baselinePlan.routes[0]!.stops[1]!,
              baselinePlan.routes[0]!.stops[2]!,
            ],
          },
        ],
      };

      const res = repairResourceOffline('res-A', baseScenario, frozenPlan, provider);
      expect(res.success).toBe(false);
      expect(res.hasFrozenConflict).toBe(true);
      expect(res.warnings.some((w) => w.includes('committed/frozen'))).toBe(true);
    });
  });

  describe('repairRequestCancellation', () => {
    it('removes eligible mutable pickup and adjusts downstream dropoff', () => {
      const res = repairRequestCancellation('req-1', baseScenario, baselinePlan, provider);

      expect(res.success).toBe(true);
      expect(res.affectedResourceId).toBe('res-A');
      expect(res.repairedRoutes).toBeDefined();

      const routeA = res.repairedRoutes!.find((r) => r.resourceId === 'res-A')!;
      expect(routeA.servedRequestIds).toEqual(['req-2']);
      expect(routeA.servedRequestIds).not.toContain('req-1');

      // Passenger load at shelter dropoff should now be 3 (req-2 only) instead of 5
      const dropoff = routeA.stops.find((s) => s.type === 'DROPOFF')!;
      expect(dropoff.passengersDroppedOff).toBe(3);
    });

    it('handles cancellation of the only request leaving an empty route', () => {
      const singleReqPlan: SolverPlan = {
        ...baselinePlan,
        routes: [
          {
            resourceId: 'res-A',
            totalTravelDistanceKm: 10,
            totalDurationMinutes: 20,
            servedRequestIds: ['req-1'],
            stops: [baselinePlan.routes[0]!.stops[0]!, baselinePlan.routes[0]!.stops[2]!],
          },
        ],
      };

      const res = repairRequestCancellation('req-1', baseScenario, singleReqPlan, provider);
      expect(res.success).toBe(true);
      const routeA = res.repairedRoutes!.find((r) => r.resourceId === 'res-A')!;
      expect(routeA.stops.length).toBe(0);
      expect(routeA.servedRequestIds.length).toBe(0);
    });

    it('safely handles cancellation of an unknown request without crashing', () => {
      const res = repairRequestCancellation(
        'req-nonexistent',
        baseScenario,
        baselinePlan,
        provider,
      );
      expect(res.success).toBe(true);
      expect(res.warning).toContain('not served');
      expect(res.repairedRoutes).toHaveLength(baselinePlan.routes.length);
    });

    it('prohibits silent automatic removal of a frozen committed request', () => {
      const frozenPlan: SolverPlan = {
        ...baselinePlan,
        routes: [
          {
            ...baselinePlan.routes[0]!,
            stops: [
              { ...baselinePlan.routes[0]!.stops[0]!, isFrozen: true }, // req-1 frozen
              baselinePlan.routes[0]!.stops[1]!,
              baselinePlan.routes[0]!.stops[2]!,
            ],
          },
        ],
      };

      const res = repairRequestCancellation('req-1', baseScenario, frozenPlan, provider);
      expect(res.success).toBe(false);
      expect(res.isImmutableFrozen).toBe(true);
      expect(res.warning).toContain('committed/frozen');
    });
  });
});
