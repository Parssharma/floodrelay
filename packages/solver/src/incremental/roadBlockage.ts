import type {
  BlockedZone,
  GeoPoint,
  RescueRequest,
  ResourceRoute,
  Scenario,
  SolverPlan,
  UnservedRequest,
} from '@floodrelay/shared';
import { HazardAwareTravelTimeProvider } from '../routing/hazardAwareTravelTime.js';
import type { TravelTimeProvider } from '../routing/travelTime.js';
import { getFirstMutableIndex, recomputeAndValidateRoute } from './routeUtils.js';
import { insertRequestBestFeasible } from './insertion.js';

export interface RoadBlockageRepairResult {
  success: boolean;
  repairedRoutes?: ResourceRoute[];
  newlyUnserved: UnservedRequest[];
  affectedResourceIds: string[];
  warnings: string[];
  hasFrozenConflict: boolean;
  updatedProvider: TravelTimeProvider;
}

/**
 * Handles ROAD_BLOCKED operational event.
 *
 * 1. Augments scenario blocked zones with the incoming blockedZone.
 * 2. Wraps the travel time provider with HazardAwareTravelTimeProvider (INFINITE policy).
 * 3. Scans all active routes to identify legs that cross the newly blocked zone.
 * 4. Preserves frozen commitments: if a blocked leg connects frozen stops, reports conflict.
 * 5. For routes with blocked mutable segments, extracts mutable requests and attempts
 *    hazard-safe reallocation. Requests that cannot be safely routed become
 *    unserved with UNREACHABLE_DUE_TO_HAZARD.
 */
export function repairRoadBlockage(
  newZone: BlockedZone,
  scenario: Scenario,
  baselinePlan: SolverPlan,
  innerProvider: TravelTimeProvider,
  maxShiftMinutes = 480,
  toleranceMinutes = 0.1,
): RoadBlockageRepairResult {
  const warnings: string[] = [];
  const newlyUnserved: UnservedRequest[] = [];
  const affectedResourceIds: string[] = [];

  // Combine existing blocked zones with the newly authoritative blocked zone
  const existingZones = scenario.blockedZones ?? [];
  const allZones: BlockedZone[] = [...existingZones];
  if (!allZones.some((z) => z.id === newZone.id)) {
    allZones.push(newZone);
  }

  // Construct hazard-aware provider with INFINITE policy (strict hazard exclusion)
  const hazardProvider = new HazardAwareTravelTimeProvider(innerProvider, allZones, {
    blockedPolicy: 'INFINITE',
  });

  const resourceMap = new Map(scenario.resources.map((r) => [r.id, r]));
  const requestMap = new Map(scenario.requests.map((r) => [r.id, r]));

  const repairedRoutes: ResourceRoute[] = [];
  const mutableRequestsToReallocate: RescueRequest[] = [];

  for (const route of baselinePlan.routes) {
    const resource = resourceMap.get(route.resourceId);
    if (!resource) {
      warnings.push(`Unknown resource '${route.resourceId}'`);
      repairedRoutes.push(route);
      continue;
    }

    if (route.stops.length === 0) {
      repairedRoutes.push(route);
      continue;
    }

    // Inspect each leg in the route for hazard blockage
    let routeBlocked = false;
    let blockedFrozenLeg = false;
    let prevLoc: GeoPoint = { lat: resource.lat, lng: resource.lng };
    let prevFrozen = false;

    for (let i = 0; i < route.stops.length; i++) {
      const stop = route.stops[i]!;
      const legEst = hazardProvider.getTravelEstimate(
        prevLoc,
        { lat: stop.lat, lng: stop.lng },
        resource.speedKmH,
        undefined,
        resource.type,
      );

      if (legEst.blocked && !Number.isFinite(legEst.durationMinutes)) {
        routeBlocked = true;
        if (prevFrozen && stop.isFrozen) {
          blockedFrozenLeg = true;
        }
      }

      prevLoc = { lat: stop.lat, lng: stop.lng };
      prevFrozen = Boolean(stop.isFrozen);
    }

    if (!routeBlocked) {
      // Unaffected route: keep exactly as is
      repairedRoutes.push(route);
      continue;
    }

    // Route is affected by the hazard
    affectedResourceIds.push(route.resourceId);

    if (blockedFrozenLeg) {
      warnings.push(
        `Route for resource '${route.resourceId}' contains a frozen committed leg blocked by hazard zone '${newZone.id}'. Human operator intervention is required.`,
      );
      return {
        success: false,
        hasFrozenConflict: true,
        newlyUnserved: [],
        affectedResourceIds,
        warnings,
        updatedProvider: hazardProvider,
      };
    }

    // Mutable segment is blocked. Preserve frozen prefix and extract mutable requests.
    const firstMutableIdx = getFirstMutableIndex(route.stops);
    const frozenStops = route.stops.slice(0, firstMutableIdx);
    const mutableStops = route.stops.slice(firstMutableIdx);

    for (const stop of mutableStops) {
      if (stop.type === 'PICKUP' && stop.targetId) {
        const req = requestMap.get(stop.targetId);
        if (req && !mutableRequestsToReallocate.some((r) => r.id === req.id)) {
          mutableRequestsToReallocate.push(req);
        }
      }
    }

    // Reconstruct route with only preserved frozen stops (plus dropoff if passengers onboard)
    if (frozenStops.length > 0) {
      const evalFrozen = recomputeAndValidateRoute(resource, frozenStops, {
        travelTimeProvider: hazardProvider,
        maxShiftMinutes,
        toleranceMinutes,
        validShelters: scenario.shelters,
      });

      if (evalFrozen.feasible && evalFrozen.route) {
        repairedRoutes.push(evalFrozen.route);
      } else {
        // If frozen prefix cannot terminate cleanly, keep original frozen stops with warning
        warnings.push(
          `Frozen prefix on resource '${route.resourceId}' required manual review after hazard clearance`,
        );
        repairedRoutes.push({
          ...route,
          stops: frozenStops,
        });
      }
    } else {
      // Route had only mutable stops: reset to empty route
      repairedRoutes.push({
        resourceId: route.resourceId,
        stops: [],
        totalTravelDistanceKm: 0,
        totalDurationMinutes: 0,
        servedRequestIds: [],
      });
    }
  }

  // Updated scenario with the new hazard zone
  const updatedScenario: Scenario = {
    ...scenario,
    blockedZones: allZones,
  };

  // Sort mutable requests by urgency descending
  const urgencyWeight: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  mutableRequestsToReallocate.sort(
    (a, b) => (urgencyWeight[b.urgency] ?? 0) - (urgencyWeight[a.urgency] ?? 0),
  );

  // Attempt to reinsert mutable requests avoiding the blocked zone
  let activeRoutes = [...repairedRoutes];

  for (const req of mutableRequestsToReallocate) {
    const insertRes = insertRequestBestFeasible(req, updatedScenario, activeRoutes, {
      travelTimeProvider: hazardProvider,
      maxShiftMinutes,
      toleranceMinutes,
    });

    if (insertRes.inserted && insertRes.updatedRoute && insertRes.resourceId) {
      activeRoutes = activeRoutes.filter((r) => r.resourceId !== insertRes.resourceId);
      activeRoutes.push(insertRes.updatedRoute);
      if (!affectedResourceIds.includes(insertRes.resourceId)) {
        affectedResourceIds.push(insertRes.resourceId);
      }
    } else {
      newlyUnserved.push({
        requestId: req.id,
        reason: 'UNREACHABLE_DUE_TO_HAZARD',
        details: `Route blocked by hazard zone '${newZone.id}' and no feasible hazard-free detour exists`,
      });
      warnings.push(
        `Request '${req.id}' is unreachable due to hazard zone '${newZone.id}' under strict safety policy`,
      );
    }
  }

  activeRoutes.sort((a, b) => a.resourceId.localeCompare(b.resourceId));

  return {
    success: true,
    repairedRoutes: activeRoutes,
    newlyUnserved,
    affectedResourceIds,
    warnings,
    hasFrozenConflict: false,
    updatedProvider: hazardProvider,
  };
}
