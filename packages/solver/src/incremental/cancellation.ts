import type { ResourceRoute, RouteStop, Scenario, SolverPlan } from '@floodrelay/shared';
import type { TravelTimeProvider } from '../routing/travelTime.js';
import { recomputeAndValidateRoute } from './routeUtils.js';

export interface CancellationRepairResult {
  success: boolean;
  repairedRoutes?: ResourceRoute[];
  affectedResourceId?: string;
  warning?: string;
  isImmutableFrozen?: boolean;
}

/**
 * Handles REQUEST_CANCELLED event.
 *
 * Locates the target request in the current plan.
 * If the request is part of a frozen commitment, rejects automatic removal.
 * If mutable, removes its pickup and updates/removes corresponding dropoff stops.
 */
export function repairRequestCancellation(
  requestId: string,
  scenario: Scenario,
  baselinePlan: SolverPlan,
  travelTimeProvider: TravelTimeProvider,
  maxShiftMinutes = 480,
  toleranceMinutes = 0.1,
): CancellationRepairResult {
  // Locate the route containing this request's pickup
  let targetRoute: ResourceRoute | undefined;
  let targetPickupStop: RouteStop | undefined;

  for (const route of baselinePlan.routes) {
    const pickup = route.stops.find((s) => s.type === 'PICKUP' && s.targetId === requestId);
    if (pickup) {
      targetRoute = route;
      targetPickupStop = pickup;
      break;
    }
  }

  // If request was not served in any route, it may simply be in unserved or non-existent
  if (!targetRoute || !targetPickupStop) {
    return {
      success: true,
      repairedRoutes: [...baselinePlan.routes],
      warning: `Cancelled request '${requestId}' was not served in any active route`,
    };
  }

  // Safety invariant: NEVER silently remove frozen/committed requests
  if (targetPickupStop.isFrozen) {
    return {
      success: false,
      isImmutableFrozen: true,
      warning: `Request '${requestId}' on resource '${targetRoute.resourceId}' has already been committed/frozen and cannot be cancelled automatically without operator intervention`,
    };
  }

  const resource = scenario.resources.find((r) => r.id === targetRoute!.resourceId);
  if (!resource) {
    return {
      success: false,
      warning: `Unknown resource '${targetRoute.resourceId}' for route`,
    };
  }

  const peopleCount = targetPickupStop.passengersPickedUp;

  // Remove the pickup stop and adjust downstream shelter dropoff
  const remainingStops: RouteStop[] = [];
  let pickupFound = false;
  let loadToDeduct = peopleCount;

  for (const stop of targetRoute.stops) {
    if (stop.type === 'PICKUP' && stop.targetId === requestId) {
      pickupFound = true;
      continue; // Skip this pickup
    }

    if (pickupFound && stop.type === 'DROPOFF' && loadToDeduct > 0) {
      const deduction = Math.min(stop.passengersDroppedOff, loadToDeduct);
      const newDroppedOff = stop.passengersDroppedOff - deduction;
      loadToDeduct -= deduction;

      if (newDroppedOff > 0) {
        remainingStops.push({
          ...stop,
          passengersDroppedOff: newDroppedOff,
        });
      }
      // If newDroppedOff === 0, omit intermediate dropoff
      continue;
    }

    remainingStops.push({ ...stop });
  }

  // If remainingStops has only dropoffs without pickups, or ends without dropoff:
  // Check if any pickups remain
  const hasRemainingPickups = remainingStops.some((s) => s.type === 'PICKUP');
  let finalStops: RouteStop[] = [];

  if (!hasRemainingPickups) {
    // Route is now empty
    finalStops = [];
  } else {
    // Ensure route ends with a dropoff at shelter
    if (
      remainingStops.length > 0 &&
      remainingStops[remainingStops.length - 1]!.type !== 'DROPOFF'
    ) {
      // Re-add dropoff at first shelter or nearest shelter
      const defaultShelter = scenario.shelters[0]!;
      let totalRemainingPickedUp = 0;
      let totalRemainingDroppedOff = 0;
      for (const s of remainingStops) {
        if (s.type === 'PICKUP') totalRemainingPickedUp += s.passengersPickedUp;
        if (s.type === 'DROPOFF') totalRemainingDroppedOff += s.passengersDroppedOff;
      }
      const missingDropoff = totalRemainingPickedUp - totalRemainingDroppedOff;
      if (missingDropoff > 0) {
        remainingStops.push({
          stopNumber: remainingStops.length + 1,
          type: 'DROPOFF',
          targetId: defaultShelter.id,
          lat: defaultShelter.lat,
          lng: defaultShelter.lng,
          passengersPickedUp: 0,
          passengersDroppedOff: missingDropoff,
          estimatedArrivalMinutes: 0,
          isFrozen: false,
        });
      }
    }
    finalStops = remainingStops;
  }

  const evalResult = recomputeAndValidateRoute(resource, finalStops, {
    travelTimeProvider,
    maxShiftMinutes,
    toleranceMinutes,
    validShelters: scenario.shelters,
  });

  if (!evalResult.feasible || !evalResult.route) {
    return {
      success: false,
      warning: `Failed to recompute valid route after cancelling request '${requestId}': ${evalResult.infeasibilityReason}`,
    };
  }

  const updatedRoutes = baselinePlan.routes.map((r) =>
    r.resourceId === targetRoute!.resourceId ? evalResult.route! : r,
  );

  return {
    success: true,
    repairedRoutes: updatedRoutes,
    affectedResourceId: targetRoute.resourceId,
  };
}
