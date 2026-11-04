import type {
  GeoPoint,
  RescueResource,
  ResourceRoute,
  RouteStop,
  Shelter,
} from '@floodrelay/shared';
import type { TravelTimeProvider } from '../routing/travelTime.js';
import type { FeasibleRouteEvaluation } from './types.js';

export interface RouteRecomputationOptions {
  travelTimeProvider: TravelTimeProvider;
  maxShiftMinutes?: number;
  toleranceMinutes?: number;
  validShelters: Shelter[];
}

/**
 * Recomputes all physical metrics for a resource route given an ordered list of candidate stops.
 *
 * Enforces:
 * - Departure from resource start coordinates at t = 0 min.
 * - Continuous capacity bounds: load in [0, resource.capacity] after each stop.
 * - Monotonic arrival times based on travelProvider legs.
 * - Hazard checks: legs blocked by INFINITE hazard policy are rejected.
 * - Route termination at an approved shelter.
 * - Passenger balance: all picked up passengers are dropped off before the route ends (final load == 0).
 * - Maximum shift duration bound: totalDurationMinutes <= maxShiftMinutes + toleranceMinutes.
 */
export function recomputeAndValidateRoute(
  resource: RescueResource,
  stops: RouteStop[],
  options: RouteRecomputationOptions,
): FeasibleRouteEvaluation {
  const { travelTimeProvider, validShelters } = options;
  const maxShiftMinutes = options.maxShiftMinutes ?? 480;
  const toleranceMinutes = options.toleranceMinutes ?? 0.1;
  const shelterIds = new Set(validShelters.map((s) => s.id));

  // Empty route is trivially feasible
  if (stops.length === 0) {
    return {
      feasible: true,
      route: {
        resourceId: resource.id,
        stops: [],
        totalTravelDistanceKm: 0,
        totalDurationMinutes: 0,
        servedRequestIds: [],
      },
      incrementalDurationMinutes: 0,
      incrementalDistanceKm: 0,
    };
  }

  // Non-empty route must terminate at a recognized shelter
  const lastStop = stops[stops.length - 1]!;
  if (lastStop.type !== 'DROPOFF' || !shelterIds.has(lastStop.targetId)) {
    return {
      feasible: false,
      incrementalDurationMinutes: Number.POSITIVE_INFINITY,
      incrementalDistanceKm: Number.POSITIVE_INFINITY,
      infeasibilityReason: 'ROUTE_MUST_END_AT_SHELTER',
    };
  }

  let prevLocation: GeoPoint = { lat: resource.lat, lng: resource.lng };
  let currentMinutes = 0;
  let totalDistanceKm = 0;
  let currentLoad = 0;

  const recomputedStops: RouteStop[] = [];
  const servedRequestIds: string[] = [];
  const onboardRequests = new Set<string>();

  for (let i = 0; i < stops.length; i++) {
    const rawStop = stops[i]!;
    const stopNumber = i + 1;

    // Physical travel estimation for this leg
    const leg = travelTimeProvider.getTravelEstimate(
      prevLocation,
      { lat: rawStop.lat, lng: rawStop.lng },
      resource.speedKmH,
      undefined,
      resource.type,
    );

    if (leg.blocked && !Number.isFinite(leg.durationMinutes)) {
      return {
        feasible: false,
        incrementalDurationMinutes: Number.POSITIVE_INFINITY,
        incrementalDistanceKm: Number.POSITIVE_INFINITY,
        infeasibilityReason: 'UNREACHABLE_DUE_TO_HAZARD',
      };
    }

    currentMinutes += leg.durationMinutes;
    totalDistanceKm += leg.distanceKm;

    if (rawStop.type === 'PICKUP') {
      const pickedUp = rawStop.passengersPickedUp;
      if (pickedUp <= 0) {
        return {
          feasible: false,
          incrementalDurationMinutes: Number.POSITIVE_INFINITY,
          incrementalDistanceKm: Number.POSITIVE_INFINITY,
          infeasibilityReason: 'INVALID_PICKUP_COUNT',
        };
      }
      currentLoad += pickedUp;
      if (currentLoad > resource.capacity) {
        return {
          feasible: false,
          incrementalDurationMinutes: Number.POSITIVE_INFINITY,
          incrementalDistanceKm: Number.POSITIVE_INFINITY,
          infeasibilityReason: 'CAPACITY_EXCEEDED',
        };
      }
      servedRequestIds.push(rawStop.targetId);
      onboardRequests.add(rawStop.targetId);
    } else if (rawStop.type === 'DROPOFF') {
      const droppedOff = rawStop.passengersDroppedOff;
      if (droppedOff <= 0 || droppedOff > currentLoad) {
        return {
          feasible: false,
          incrementalDurationMinutes: Number.POSITIVE_INFINITY,
          incrementalDistanceKm: Number.POSITIVE_INFINITY,
          infeasibilityReason: 'INVALID_DROPOFF_COUNT',
        };
      }
      currentLoad -= droppedOff;
      if (currentLoad === 0) {
        onboardRequests.clear();
      }
    }

    recomputedStops.push({
      stopNumber,
      type: rawStop.type,
      targetId: rawStop.targetId,
      lat: rawStop.lat,
      lng: rawStop.lng,
      passengersPickedUp: rawStop.passengersPickedUp,
      passengersDroppedOff: rawStop.passengersDroppedOff,
      estimatedArrivalMinutes: Number(currentMinutes.toFixed(2)),
      isFrozen: Boolean(rawStop.isFrozen),
    });

    prevLocation = { lat: rawStop.lat, lng: rawStop.lng };
  }

  // Must end with 0 onboard passengers
  if (currentLoad !== 0 || onboardRequests.size !== 0) {
    return {
      feasible: false,
      incrementalDurationMinutes: Number.POSITIVE_INFINITY,
      incrementalDistanceKm: Number.POSITIVE_INFINITY,
      infeasibilityReason: 'UNDELIVERED_PASSENGERS',
    };
  }

  // Shift limit bound
  if (currentMinutes > maxShiftMinutes + toleranceMinutes) {
    return {
      feasible: false,
      incrementalDurationMinutes: Number.POSITIVE_INFINITY,
      incrementalDistanceKm: Number.POSITIVE_INFINITY,
      infeasibilityReason: 'SHIFT_LIMIT_REACHED',
    };
  }

  const roundedDuration = Number(currentMinutes.toFixed(2));
  const roundedDistance = Number(totalDistanceKm.toFixed(2));

  return {
    feasible: true,
    route: {
      resourceId: resource.id,
      stops: recomputedStops,
      totalTravelDistanceKm: roundedDistance,
      totalDurationMinutes: roundedDuration,
      servedRequestIds,
    },
    incrementalDurationMinutes: roundedDuration,
    incrementalDistanceKm: roundedDistance,
  };
}

/**
 * Returns the index of the first mutable position in a route's stops array.
 * Stops before this index are frozen and must not be altered or preceded by new stops.
 */
export function getFirstMutableIndex(stops: RouteStop[]): number {
  let lastFrozenIdx = -1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]?.isFrozen) {
      lastFrozenIdx = i;
    }
  }
  return lastFrozenIdx + 1;
}
