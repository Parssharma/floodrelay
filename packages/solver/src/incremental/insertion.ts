import type {
  RescueRequest,
  RescueResource,
  ResourceRoute,
  RouteStop,
  Scenario,
  Shelter,
  UnservedReason,
} from '@floodrelay/shared';
import type { TravelTimeProvider } from '../routing/travelTime.js';
import { getFirstMutableIndex, recomputeAndValidateRoute } from './routeUtils.js';
import type { CandidateInsertionOption } from './types.js';

export interface InsertionOptions {
  travelTimeProvider: TravelTimeProvider;
  maxShiftMinutes?: number;
  toleranceMinutes?: number;
}

export interface BestInsertionResult {
  inserted: boolean;
  resourceId?: string;
  updatedRoute?: ResourceRoute;
  originalRoute?: ResourceRoute;
  unservedReason?: UnservedReason;
  unservedDetails?: string;
  evaluatedCandidatesCount: number;
}

/**
 * Finds the best feasible insertion for a rescue request into existing routes.
 *
 * Considers:
 * 1. Insertion into active routes after all frozen stops (at mutable positions).
 *    - Option A: Pair pickup with an existing mutable dropoff at a shelter.
 *    - Option B: Pair pickup with a newly inserted dropoff at an approved shelter.
 * 2. Starting an idle available resource (only if capacity fits and shift bounds hold).
 *
 * Objective Function:
 *   objectiveScore = deltaDurationMinutes + (isNewRoute ? 15.0 : 0.0)
 *
 * Deterministic Tie-breaking:
 *   1. objectiveScore (rounded to 4 decimals)
 *   2. deltaDistanceKm (rounded to 4 decimals)
 *   3. resourceId (lexicographical)
 *   4. pickupIndex (ascending)
 *   5. dropoffIndex (ascending)
 *   6. shelterId (lexicographical)
 */
export function insertRequestBestFeasible(
  request: RescueRequest,
  scenario: Scenario,
  currentRoutes: ResourceRoute[],
  options: InsertionOptions,
): BestInsertionResult {
  const maxShiftMinutes = options.maxShiftMinutes ?? 480;
  const toleranceMinutes = options.toleranceMinutes ?? 0.1;
  const provider = options.travelTimeProvider;

  const shelters = scenario.shelters;
  if (shelters.length === 0) {
    return {
      inserted: false,
      unservedReason: 'NO_REACHABLE_RESOURCE',
      unservedDetails: 'No shelters available in scenario',
      evaluatedCandidatesCount: 0,
    };
  }

  // Filter available resources with capacity >= peopleCount
  const eligibleResources = scenario.resources.filter(
    (r) =>
      (r.status === 'AVAILABLE' || r.status === 'ASSIGNED') && r.capacity >= request.peopleCount,
  );

  if (eligibleResources.length === 0) {
    // Check if peopleCount exceeds ALL vehicle capacities in scenario
    const maxCapacity = Math.max(...scenario.resources.map((r) => r.capacity), 0);
    const reason: UnservedReason =
      request.peopleCount > maxCapacity ? 'GROUP_LARGER_THAN_ANY_VEHICLE' : 'CAPACITY_EXCEEDED';
    return {
      inserted: false,
      unservedReason: reason,
      unservedDetails:
        request.peopleCount > maxCapacity
          ? `Request peopleCount (${request.peopleCount}) exceeds maximum vehicle capacity (${maxCapacity})`
          : 'No available resources with sufficient capacity',
      evaluatedCandidatesCount: 0,
    };
  }

  // Index routes by resourceId
  const routesByResource = new Map<string, ResourceRoute>();
  for (const r of currentRoutes) {
    routesByResource.set(r.resourceId, r);
  }

  const candidateOptions: CandidateInsertionOption[] = [];

  // Sort resources deterministically by ID to ensure stable iteration
  const sortedResources = [...eligibleResources].sort((a, b) => a.id.localeCompare(b.id));

  for (const res of sortedResources) {
    const existingRoute = routesByResource.get(res.id);
    const existingStops = existingRoute?.stops ? [...existingRoute.stops] : [];
    const origDuration = existingRoute?.totalDurationMinutes ?? 0;
    const origDistance = existingRoute?.totalTravelDistanceKm ?? 0;

    const firstMutableIdx = getFirstMutableIndex(existingStops);

    // Case 1: Resource has an existing route
    if (existingStops.length > 0) {
      const m = existingStops.length;

      // Pickup position p can be from firstMutableIdx to m (inserting before stop p)
      for (let p = firstMutableIdx; p <= m; p++) {
        // Option A: Deliver to an existing mutable shelter dropoff stop at j >= p
        for (let j = p; j < m; j++) {
          const targetDropoff = existingStops[j]!;
          if (targetDropoff.type === 'DROPOFF' && !targetDropoff.isFrozen) {
            // Construct new candidate stops with increased dropoff count
            const newStops: RouteStop[] = [];
            for (let idx = 0; idx < m; idx++) {
              if (idx === p) {
                newStops.push({
                  stopNumber: 0, // recomputed
                  type: 'PICKUP',
                  targetId: request.id,
                  lat: request.lat,
                  lng: request.lng,
                  passengersPickedUp: request.peopleCount,
                  passengersDroppedOff: 0,
                  estimatedArrivalMinutes: 0,
                  isFrozen: false,
                });
              }
              const curr = existingStops[idx]!;
              if (idx === j) {
                newStops.push({
                  ...curr,
                  passengersDroppedOff: curr.passengersDroppedOff + request.peopleCount,
                });
              } else {
                newStops.push({ ...curr });
              }
            }
            if (p === m) {
              // Not possible for Option A because j < m
            }

            const evalResult = recomputeAndValidateRoute(res, newStops, {
              travelTimeProvider: provider,
              maxShiftMinutes,
              toleranceMinutes,
              validShelters: shelters,
            });

            if (evalResult.feasible && evalResult.route) {
              const deltaDuration = evalResult.route.totalDurationMinutes - origDuration;
              const deltaDistance = evalResult.route.totalTravelDistanceKm - origDistance;
              const objectiveScore = deltaDuration; // No activation penalty for existing route
              candidateOptions.push({
                resourceId: res.id,
                pickupIndex: p,
                dropoffIndex: j + 1,
                shelterId: targetDropoff.targetId,
                isExistingDropoff: true,
                isNewRoute: false,
                evaluatedRoute: evalResult.route,
                incrementalDurationMinutes: deltaDuration,
                incrementalDistanceKm: deltaDistance,
                objectiveScore,
              });
            }
          }
        }

        // Option B: Insert a new DROPOFF stop at an approved shelter at position d >= p + 1
        for (const shelter of shelters) {
          // Dropoff can be placed at any position from p + 1 to m + 1
          for (let d = p + 1; d <= m + 1; d++) {
            const newStops: RouteStop[] = [];
            let pickupInserted = false;
            let dropoffInserted = false;

            for (let idx = 0; idx <= m; idx++) {
              if (idx === p && !pickupInserted) {
                newStops.push({
                  stopNumber: 0,
                  type: 'PICKUP',
                  targetId: request.id,
                  lat: request.lat,
                  lng: request.lng,
                  passengersPickedUp: request.peopleCount,
                  passengersDroppedOff: 0,
                  estimatedArrivalMinutes: 0,
                  isFrozen: false,
                });
                pickupInserted = true;
              }

              // After pickup insertion, stop indices shifted by 1
              const currentStopsCount = newStops.length;
              if (currentStopsCount === d && !dropoffInserted) {
                newStops.push({
                  stopNumber: 0,
                  type: 'DROPOFF',
                  targetId: shelter.id,
                  lat: shelter.lat,
                  lng: shelter.lng,
                  passengersPickedUp: 0,
                  passengersDroppedOff: request.peopleCount,
                  estimatedArrivalMinutes: 0,
                  isFrozen: false,
                });
                dropoffInserted = true;
              }

              if (idx < m) {
                newStops.push({ ...existingStops[idx]! });
              }
            }

            if (!dropoffInserted && newStops.length === d) {
              newStops.push({
                stopNumber: 0,
                type: 'DROPOFF',
                targetId: shelter.id,
                lat: shelter.lat,
                lng: shelter.lng,
                passengersPickedUp: 0,
                passengersDroppedOff: request.peopleCount,
                estimatedArrivalMinutes: 0,
                isFrozen: false,
              });
              dropoffInserted = true;
            }

            // Must terminate at shelter
            if (newStops.length > 0 && newStops[newStops.length - 1]!.type !== 'DROPOFF') {
              continue;
            }

            const evalResult = recomputeAndValidateRoute(res, newStops, {
              travelTimeProvider: provider,
              maxShiftMinutes,
              toleranceMinutes,
              validShelters: shelters,
            });

            if (evalResult.feasible && evalResult.route) {
              const deltaDuration = evalResult.route.totalDurationMinutes - origDuration;
              const deltaDistance = evalResult.route.totalTravelDistanceKm - origDistance;
              const objectiveScore = deltaDuration;
              candidateOptions.push({
                resourceId: res.id,
                pickupIndex: p,
                dropoffIndex: d,
                shelterId: shelter.id,
                isExistingDropoff: false,
                isNewRoute: false,
                evaluatedRoute: evalResult.route,
                incrementalDurationMinutes: deltaDuration,
                incrementalDistanceKm: deltaDistance,
                objectiveScore,
              });
            }
          }
        }
      }
    } else {
      // Case 2: Idle resource (create a new route starting with this request)
      for (const shelter of shelters) {
        const candidateStops: RouteStop[] = [
          {
            stopNumber: 1,
            type: 'PICKUP',
            targetId: request.id,
            lat: request.lat,
            lng: request.lng,
            passengersPickedUp: request.peopleCount,
            passengersDroppedOff: 0,
            estimatedArrivalMinutes: 0,
            isFrozen: false,
          },
          {
            stopNumber: 2,
            type: 'DROPOFF',
            targetId: shelter.id,
            lat: shelter.lat,
            lng: shelter.lng,
            passengersPickedUp: 0,
            passengersDroppedOff: request.peopleCount,
            estimatedArrivalMinutes: 0,
            isFrozen: false,
          },
        ];

        const evalResult = recomputeAndValidateRoute(res, candidateStops, {
          travelTimeProvider: provider,
          maxShiftMinutes,
          toleranceMinutes,
          validShelters: shelters,
        });

        if (evalResult.feasible && evalResult.route) {
          const deltaDuration = evalResult.route.totalDurationMinutes;
          const deltaDistance = evalResult.route.totalTravelDistanceKm;
          // Apply activation penalty (15 min) to prefer packing existing routes if reasonable
          const objectiveScore = deltaDuration + 15.0;

          candidateOptions.push({
            resourceId: res.id,
            pickupIndex: 0,
            dropoffIndex: 1,
            shelterId: shelter.id,
            isExistingDropoff: false,
            isNewRoute: true,
            evaluatedRoute: evalResult.route,
            incrementalDurationMinutes: deltaDuration,
            incrementalDistanceKm: deltaDistance,
            objectiveScore,
          });
        }
      }
    }
  }

  if (candidateOptions.length === 0) {
    return {
      inserted: false,
      unservedReason: 'SHIFT_LIMIT_REACHED',
      unservedDetails:
        'No feasible insertion satisfies shift duration, capacity, or hazard constraints',
      evaluatedCandidatesCount: 0,
    };
  }

  // Deterministic sorting / tie-breaking
  candidateOptions.sort((a, b) => {
    // 1. Objective score
    const diffScore = a.objectiveScore - b.objectiveScore;
    if (Math.abs(diffScore) > 1e-4) return diffScore;

    // 2. Incremental distance
    const diffDist = a.incrementalDistanceKm - b.incrementalDistanceKm;
    if (Math.abs(diffDist) > 1e-4) return diffDist;

    // 3. Resource ID (lexicographical)
    const cmpRes = a.resourceId.localeCompare(b.resourceId);
    if (cmpRes !== 0) return cmpRes;

    // 4. Pickup index
    if (a.pickupIndex !== b.pickupIndex) return a.pickupIndex - b.pickupIndex;

    // 5. Dropoff index
    if (a.dropoffIndex !== b.dropoffIndex) return a.dropoffIndex - b.dropoffIndex;

    // 6. Shelter ID
    return a.shelterId.localeCompare(b.shelterId);
  });

  const best = candidateOptions[0]!;
  const originalRoute = routesByResource.get(best.resourceId);

  return {
    inserted: true,
    resourceId: best.resourceId,
    updatedRoute: best.evaluatedRoute,
    originalRoute,
    evaluatedCandidatesCount: candidateOptions.length,
  };
}
