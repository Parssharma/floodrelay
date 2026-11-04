import type {
  RescueRequest,
  ResourceRoute,
  Scenario,
  SolverPlan,
  UnservedReason,
  UnservedRequest,
} from '@floodrelay/shared';
import type { TravelTimeProvider } from '../routing/travelTime.js';
import { insertRequestBestFeasible } from './insertion.js';
import { recomputeAndValidateRoute } from './routeUtils.js';

export interface ResourceOfflineRepairResult {
  success: boolean;
  repairedRoutes?: ResourceRoute[];
  newlyUnserved: UnservedRequest[];
  affectedResourceIds: string[];
  warnings: string[];
  hasFrozenConflict: boolean;
}

/**
 * Handles RESOURCE_OFFLINE operational event.
 *
 * 1. Checks if the offline resource has committed/frozen work.
 *    If so, flags a critical conflict requiring operator attention; frozen work cannot be silently moved.
 * 2. Unassigns mutable requests from the offline resource.
 * 3. Sorts affected mutable requests by urgency descending.
 * 4. Sequentially attempts best-feasible insertion into remaining active/available resources.
 * 5. Returns any requests that could not be feasibly reallocated as unserved.
 */
export function repairResourceOffline(
  resourceId: string,
  scenario: Scenario,
  baselinePlan: SolverPlan,
  travelTimeProvider: TravelTimeProvider,
  maxShiftMinutes = 480,
  toleranceMinutes = 0.1,
): ResourceOfflineRepairResult {
  const warnings: string[] = [];
  const newlyUnserved: UnservedRequest[] = [];
  const affectedResourceIds: string[] = [resourceId];

  const targetRoute = baselinePlan.routes.find((r) => r.resourceId === resourceId);
  if (!targetRoute || targetRoute.stops.length === 0) {
    // Resource was not serving any stops; no reassignments needed
    return {
      success: true,
      repairedRoutes: baselinePlan.routes.filter((r) => r.resourceId !== resourceId),
      newlyUnserved: [],
      affectedResourceIds: [resourceId],
      warnings: [`Resource '${resourceId}' had no active route stops`],
      hasFrozenConflict: false,
    };
  }

  // Check for frozen/committed work
  const frozenStops = targetRoute.stops.filter((s) => s.isFrozen);
  if (frozenStops.length > 0) {
    // Critical safety requirement: cannot automatically move committed/frozen assignments
    warnings.push(
      `Resource '${resourceId}' is OFFLINE but has ${frozenStops.length} committed/frozen stops. Automatic field reassignment of committed work is prohibited; human operator intervention is required.`,
    );
    return {
      success: false,
      hasFrozenConflict: true,
      newlyUnserved: [],
      affectedResourceIds: [resourceId],
      warnings,
    };
  }

  // Gather mutable requests served on this route
  const requestMap = new Map(scenario.requests.map((r) => [r.id, r]));
  const affectedRequests: RescueRequest[] = [];

  for (const stop of targetRoute.stops) {
    if (stop.type === 'PICKUP' && stop.targetId) {
      const req = requestMap.get(stop.targetId);
      if (req) {
        affectedRequests.push(req);
      }
    }
  }

  // Active routes without the offline resource
  let activeRoutes = baselinePlan.routes.filter((r) => r.resourceId !== resourceId);

  // Available resources excluding the offline resource
  const remainingScenario: Scenario = {
    ...scenario,
    resources: scenario.resources.filter((r) => r.id !== resourceId),
  };

  // Sort affected requests by urgency: CRITICAL (4) > HIGH (3) > MEDIUM (2) > LOW (1), then peopleCount desc
  const urgencyWeight: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  affectedRequests.sort((a, b) => {
    const diff = (urgencyWeight[b.urgency] ?? 0) - (urgencyWeight[a.urgency] ?? 0);
    if (diff !== 0) return diff;
    const diffPeople = b.peopleCount - a.peopleCount;
    if (diffPeople !== 0) return diffPeople;
    return a.id.localeCompare(b.id);
  });

  // Reinsert affected requests into remaining resources
  for (const req of affectedRequests) {
    const insertRes = insertRequestBestFeasible(req, remainingScenario, activeRoutes, {
      travelTimeProvider,
      maxShiftMinutes,
      toleranceMinutes,
    });

    if (insertRes.inserted && insertRes.updatedRoute && insertRes.resourceId) {
      // Update routes
      activeRoutes = activeRoutes.filter((r) => r.resourceId !== insertRes.resourceId);
      activeRoutes.push(insertRes.updatedRoute);
      if (!affectedResourceIds.includes(insertRes.resourceId)) {
        affectedResourceIds.push(insertRes.resourceId);
      }
    } else {
      const reason: UnservedReason = insertRes.unservedReason ?? 'NO_REACHABLE_RESOURCE';
      newlyUnserved.push({
        requestId: req.id,
        reason,
        details: `Displaced from offline resource '${resourceId}': ${insertRes.unservedDetails ?? 'No feasible alternative resource route'}`,
      });
      warnings.push(
        `Displaced request '${req.id}' could not be feasibly reallocated after resource '${resourceId}' went offline`,
      );
    }
  }

  // Sort routes by resourceId deterministically
  activeRoutes.sort((a, b) => a.resourceId.localeCompare(b.resourceId));

  return {
    success: true,
    repairedRoutes: activeRoutes,
    newlyUnserved,
    affectedResourceIds,
    warnings,
    hasFrozenConflict: false,
  };
}
