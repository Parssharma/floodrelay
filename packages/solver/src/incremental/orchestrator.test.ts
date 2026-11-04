import { describe, expect, it } from 'vitest';
import type { BlockedZone, RescueRequest, Scenario, SolverPlan } from '@floodrelay/shared';
import { StraightLineTravelTimeProvider } from '../routing/travelTime.js';
import { repairIncrementally } from './orchestrator.js';

describe('repairIncrementally Orchestrator & Invariant Tests', () => {
  const provider = new StraightLineTravelTimeProvider();

  const baseScenario: Scenario = {
    id: 'orch-scenario',
    metadata: {
      id: 'orch-scenario',
      name: 'Orchestrator Scenario',
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
    ],
    resources: [
      {
        id: 'res-A',
        name: 'Rescue Truck Alpha',
        type: 'HIGH_WATER_VEHICLE',
        capacity: 6,
        speedKmH: 30,
        lat: 28.5,
        lng: 77.2,
        status: 'AVAILABLE',
      },
      {
        id: 'res-B',
        name: 'Rescue Boat Beta',
        type: 'BOAT',
        capacity: 6,
        speedKmH: 25,
        lat: 28.6,
        lng: 77.3,
        status: 'AVAILABLE',
      },
    ],
    shelters: [
      {
        id: 'shelter-1',
        name: 'Safe Shelter Central',
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
        servedRequestIds: ['req-1'],
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
    ],
    unserved: [],
    metrics: {
      coveragePercent: 100,
      totalTravelTimeMinutes: 30,
      totalTravelDistanceKm: 15,
      highPriorityWaitTimeMinutes: 10,
      solveDurationMs: 5,
      servedRequestsCount: 1,
      unservedRequestsCount: 0,
    },
  };

  it('dispatches REQUEST_CREATED event and proposes a valid candidate plan with metrics', () => {
    const newReq: RescueRequest = {
      id: 'req-2',
      lat: 28.52,
      lng: 77.22,
      peopleCount: 2,
      urgency: 'CRITICAL',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const result = repairIncrementally({
      event: {
        id: 'evt-1',
        type: 'REQUEST_CREATED',
        timestamp: new Date().toISOString(),
        request: newReq,
      },
      scenario: baseScenario,
      baselinePlan,
      travelTimeProvider: provider,
    });

    expect(result.status).toBe('PROPOSED');
    expect(result.repairedPlan).toBeDefined();
    expect(result.churn).toBeDefined();
    expect(result.churn.newlyServedRequestIds).toContain('req-2');
    expect(result.churn.comparableExistingAssignments).toBe(1);
    expect(result.churn.reassignedRequestsCount).toBe(0);
    expect(result.churn.assignmentChurnRate).toBe(0);

    const servedAll = result.repairedPlan!.routes.flatMap((r) => r.servedRequestIds);
    expect(servedAll).toContain('req-1');
    expect(servedAll).toContain('req-2');
  });

  it('dispatches RESOURCE_OFFLINE and safely reassigns mutable work', () => {
    const result = repairIncrementally({
      event: {
        id: 'evt-2',
        type: 'RESOURCE_OFFLINE',
        timestamp: new Date().toISOString(),
        resourceId: 'res-A',
      },
      scenario: baseScenario,
      baselinePlan,
      travelTimeProvider: provider,
    });

    expect(result.status).toBe('PROPOSED');
    expect(result.repairedPlan).toBeDefined();
    expect(result.affectedRouteResourceIds).toContain('res-A');
    // res-A is gone, req-1 reassigned to res-B
    expect(result.churn.reassignedRequestsCount).toBe(1);
    expect(result.churn.reassignedRequestIds).toEqual(['req-1']);
    expect(result.churn.assignmentChurnRate).toBe(1.0);
  });

  it('dispatches ROAD_BLOCKED and detours or marks requests unreachable', () => {
    // Polygon completely surrounding req-1 (28.51, 77.21)
    const hazardZone: BlockedZone = {
      id: 'zone-flood-center',
      severity: 'BLOCKED',
      polygon: [
        { lat: 28.508, lng: 77.208 },
        { lat: 28.508, lng: 77.215 },
        { lat: 28.515, lng: 77.215 },
        { lat: 28.515, lng: 77.208 },
      ],
    };

    const result = repairIncrementally({
      event: {
        id: 'evt-3',
        type: 'ROAD_BLOCKED',
        timestamp: new Date().toISOString(),
        blockedZone: hazardZone,
      },
      scenario: baseScenario,
      baselinePlan,
      travelTimeProvider: provider,
    });

    expect(result.status).toBe('PROPOSED');
    expect(result.repairedPlan).toBeDefined();
    // Since req-1 is inside the blocked zone, it cannot be reached
    expect(result.repairedPlan!.unserved.some((u) => u.requestId === 'req-1')).toBe(true);
    const unservedReq = result.repairedPlan!.unserved.find((u) => u.requestId === 'req-1');
    expect(unservedReq?.reason).toBe('UNREACHABLE_DUE_TO_HAZARD');
  });

  it('returns NO_FEASIBLE_REPAIR if road blockage cuts off a frozen route leg', () => {
    // Baseline with frozen stop
    const frozenBase: SolverPlan = {
      ...baselinePlan,
      routes: [
        {
          ...baselinePlan.routes[0]!,
          stops: [
            { ...baselinePlan.routes[0]!.stops[0]!, isFrozen: true },
            { ...baselinePlan.routes[0]!.stops[1]!, isFrozen: true },
          ],
        },
      ],
    };

    const hazardZone: BlockedZone = {
      id: 'zone-cuts-frozen',
      severity: 'BLOCKED',
      polygon: [
        { lat: 28.508, lng: 77.208 },
        { lat: 28.508, lng: 77.215 },
        { lat: 28.515, lng: 77.215 },
        { lat: 28.515, lng: 77.208 },
      ],
    };

    const result = repairIncrementally({
      event: {
        id: 'evt-4',
        type: 'ROAD_BLOCKED',
        timestamp: new Date().toISOString(),
        blockedZone: hazardZone,
      },
      scenario: baseScenario,
      baselinePlan: frozenBase,
      travelTimeProvider: provider,
    });

    expect(result.status).toBe('NO_FEASIBLE_REPAIR');
    expect(result.warnings.some((w) => w.includes('frozen committed leg'))).toBe(true);
  });

  it('enforces all physical invariants on proposed plans (no NaN, single assignment, valid load)', () => {
    const newReq: RescueRequest = {
      id: 'req-inv-test',
      lat: 28.52,
      lng: 77.22,
      peopleCount: 1,
      urgency: 'LOW',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const result = repairIncrementally({
      event: {
        id: 'evt-inv',
        type: 'REQUEST_CREATED',
        timestamp: new Date().toISOString(),
        request: newReq,
      },
      scenario: baseScenario,
      baselinePlan,
      travelTimeProvider: provider,
    });

    expect(result.status).toBe('PROPOSED');
    const plan = result.repairedPlan!;

    // 1. Metrics are finite and non-NaN
    expect(Number.isFinite(plan.metrics.totalTravelDistanceKm)).toBe(true);
    expect(Number.isFinite(plan.metrics.totalTravelTimeMinutes)).toBe(true);
    expect(Number.isNaN(plan.metrics.coveragePercent)).toBe(false);

    // 2. Single assignment
    const allAssigned = plan.routes.flatMap((r) => r.servedRequestIds);
    const uniqueAssigned = new Set(allAssigned);
    expect(allAssigned.length).toBe(uniqueAssigned.size);

    // 3. Every route ends at a shelter with 0 passengers
    for (const route of plan.routes) {
      if (route.stops.length > 0) {
        const last = route.stops[route.stops.length - 1]!;
        expect(last.type).toBe('DROPOFF');
        let load = 0;
        for (const s of route.stops) {
          if (s.type === 'PICKUP') load += s.passengersPickedUp;
          if (s.type === 'DROPOFF') load -= s.passengersDroppedOff;
          expect(load).toBeGreaterThanOrEqual(0);
        }
        expect(load).toBe(0);
      }
    }
  });
});
