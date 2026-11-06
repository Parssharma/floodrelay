import { describe, expect, it } from 'vitest';
import type { RescueRequest, ResourceRoute, Scenario } from '@floodrelay/shared';
import { StraightLineTravelTimeProvider } from '../routing/travelTime.js';
import { insertRequestBestFeasible } from './insertion.js';

describe('Incremental Best-Feasible Insertion', () => {
  const provider = new StraightLineTravelTimeProvider();

  const baseScenario: Scenario = {
    id: 'insertion-test-scenario',
    metadata: {
      id: 'insertion-test-scenario',
      name: 'Insertion Test',
      region: 'Delhi',
      createdAt: new Date().toISOString(),
      bounds: { minLat: 28.4, maxLat: 28.7, minLng: 77.1, maxLng: 77.4 },
    },
    requests: [],
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
        capacity: 4,
        speedKmH: 25,
        lat: 28.6,
        lng: 77.3,
        status: 'AVAILABLE',
      },
    ],
    shelters: [
      {
        id: 'shelter-1',
        name: 'Central Relief Shelter',
        lat: 28.55,
        lng: 77.25,
        capacity: 100,
      },
    ],
  };

  it('inserts a single new request feasibly into an empty route', () => {
    const req: RescueRequest = {
      id: 'req-1',
      lat: 28.51,
      lng: 77.21,
      peopleCount: 3,
      urgency: 'HIGH',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const res = insertRequestBestFeasible(req, baseScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(res.inserted).toBe(true);
    expect(res.resourceId).toBeDefined();
    expect(res.updatedRoute).toBeDefined();
    expect(res.updatedRoute!.servedRequestIds).toContain('req-1');
    expect(res.updatedRoute!.stops.length).toBe(2);
    expect(res.updatedRoute!.stops[0]!.type).toBe('PICKUP');
    expect(res.updatedRoute!.stops[1]!.type).toBe('DROPOFF');
    expect(res.updatedRoute!.stops[1]!.targetId).toBe('shelter-1');
  });

  it('evaluates multiple candidate routes and chooses the lowest incremental cost', () => {
    // res-A is closer to req than res-B
    const req: RescueRequest = {
      id: 'req-close-to-A',
      lat: 28.505,
      lng: 77.205, // very close to res-A (28.5, 77.2)
      peopleCount: 2,
      urgency: 'MEDIUM',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const res = insertRequestBestFeasible(req, baseScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(res.inserted).toBe(true);
    expect(res.resourceId).toBe('res-A');
  });

  it('exhibits strictly deterministic tie-breaking on identical cost candidates', () => {
    // Symmetrical request equidistant between two identical resources
    const symmetricScenario: Scenario = {
      ...baseScenario,
      resources: [
        {
          id: 'res-Z',
          name: 'Boat Z',
          type: 'BOAT',
          capacity: 4,
          speedKmH: 25,
          lat: 28.5,
          lng: 77.2,
          status: 'AVAILABLE',
        },
        {
          id: 'res-A',
          name: 'Boat A',
          type: 'BOAT',
          capacity: 4,
          speedKmH: 25,
          lat: 28.5,
          lng: 77.2,
          status: 'AVAILABLE',
        },
      ],
    };

    const req: RescueRequest = {
      id: 'req-sym',
      lat: 28.55,
      lng: 77.25,
      peopleCount: 2,
      urgency: 'HIGH',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    // First run
    const run1 = insertRequestBestFeasible(req, symmetricScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    // Second run
    const run2 = insertRequestBestFeasible(req, symmetricScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(run1.inserted).toBe(true);
    expect(run2.inserted).toBe(true);
    // res-A comes before res-Z lexicographically
    expect(run1.resourceId).toBe('res-A');
    expect(run2.resourceId).toBe('res-A');
    expect(run1.updatedRoute?.totalDurationMinutes).toBe(run2.updatedRoute?.totalDurationMinutes);
  });

  it('rejects insertion when peopleCount exceeds vehicle capacity', () => {
    const hugeReq: RescueRequest = {
      id: 'req-huge',
      lat: 28.51,
      lng: 77.21,
      peopleCount: 10, // Max vehicle capacity is 6
      urgency: 'CRITICAL',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const res = insertRequestBestFeasible(hugeReq, baseScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(res.inserted).toBe(false);
    expect(res.unservedReason).toBe('GROUP_LARGER_THAN_ANY_VEHICLE');
  });

  it('rejects insertion when available vehicles have zero remaining capacity', () => {
    // res-A already at full capacity (6/6)
    const activeRoute: ResourceRoute = {
      resourceId: 'res-A',
      totalTravelDistanceKm: 15,
      totalDurationMinutes: 30,
      servedRequestIds: ['existing-req'],
      stops: [
        {
          stopNumber: 1,
          type: 'PICKUP',
          targetId: 'existing-req',
          lat: 28.51,
          lng: 77.21,
          passengersPickedUp: 6,
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
          passengersDroppedOff: 6,
          estimatedArrivalMinutes: 30,
          isFrozen: false,
        },
      ],
    };

    // New request requires 2 people. res-B has cap 4 and is idle, but if res-B is OFFLINE:
    const constrainedScenario: Scenario = {
      ...baseScenario,
      resources: [
        baseScenario.resources[0]!, // res-A only
      ],
    };

    const newReq: RescueRequest = {
      id: 'req-overflow',
      lat: 28.52,
      lng: 77.22,
      peopleCount: 2,
      urgency: 'HIGH',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    // If we attempt to insert between pickup and dropoff of res-A without a prior dropoff, capacity 6+2=8 > 6
    // But inserting a new trip (pickup after shelter dropoff) should work if within shift limit
    const res = insertRequestBestFeasible(newReq, constrainedScenario, [activeRoute], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(res.inserted).toBe(true);
    // It should have inserted a second multi-trip leg after shelter-1 dropoff
    const stops = res.updatedRoute!.stops;
    expect(stops.length).toBe(4);
    expect(stops[0]!.type).toBe('PICKUP');
    expect(stops[1]!.type).toBe('DROPOFF'); // empties first load
    expect(stops[2]!.type).toBe('PICKUP'); // picks up newReq
    expect(stops[3]!.type).toBe('DROPOFF'); // final dropoff
  });

  it('rejects insertion when maximum shift duration would be exceeded', () => {
    const farReq: RescueRequest = {
      id: 'req-far',
      lat: 28.69,
      lng: 77.39,
      peopleCount: 1,
      urgency: 'LOW',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    // Extreme shift limit of only 5 minutes (physically impossible to reach)
    const res = insertRequestBestFeasible(farReq, baseScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 5,
    });

    expect(res.inserted).toBe(false);
    expect(res.unservedReason).toBe('SHIFT_LIMIT_REACHED');
  });

  it('guarantees that pickup always occurs before dropoff', () => {
    const req: RescueRequest = {
      id: 'req-seq',
      lat: 28.52,
      lng: 77.22,
      peopleCount: 2,
      urgency: 'HIGH',
      createdAt: new Date().toISOString(),
      source: 'SIMULATED',
    };

    const res = insertRequestBestFeasible(req, baseScenario, [], {
      travelTimeProvider: provider,
      maxShiftMinutes: 480,
    });

    expect(res.inserted).toBe(true);
    const stops = res.updatedRoute!.stops;
    const pickupIdx = stops.findIndex((s) => s.type === 'PICKUP' && s.targetId === 'req-seq');
    const dropoffIdx = stops.findIndex((s) => s.type === 'DROPOFF');
    expect(pickupIdx).toBeGreaterThanOrEqual(0);
    expect(dropoffIdx).toBeGreaterThan(pickupIdx);
  });
});
