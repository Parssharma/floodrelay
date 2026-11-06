import type { ResourceRoute, Scenario, SolverPlan, UnservedRequest } from '@floodrelay/shared';
import { calculatePlanMetrics } from '../metrics.js';
import { calculateIncrementalChurn } from '../metrics/churn.js';
import { validateSolverPlan } from '../planValidator.js';
import { StraightLineTravelTimeProvider } from '../routing/travelTime.js';
import { repairRequestCancellation } from './cancellation.js';
import { validateFrozenStopsPreserved } from './frozenStops.js';
import { insertRequestBestFeasible } from './insertion.js';
import { repairResourceOffline } from './localRepair.js';
import { repairRoadBlockage } from './roadBlockage.js';
import type { IncrementalRepairInput, IncrementalRepairResult } from './types.js';

/**
 * Pure Incremental Optimization and Local Repair Engine.
 *
 * Repairs affected portions of existing rescue plans when operational events occur,
 * avoiding full re-solving while preserving all committed/frozen stops.
 *
 * Supported Operational Events:
 * - REQUEST_CREATED: Deterministic best-feasible insertion into mutable route positions.
 * - RESOURCE_OFFLINE: Preserves frozen work and locally reassigns mutable work.
 * - REQUEST_CANCELLED: Removes mutable stops and recalibrates downstream dropoffs.
 * - ROAD_BLOCKED: Identifies affected legs, enforces INFINITE hazard exclusion, and detours.
 * - RESOURCE_AVAILABLE: Attempts best-feasible insertion of pending unserved requests.
 *
 * Invariant: Never alters or moves frozen stops. Never automatically commits assignments.
 */
export function repairIncrementally(input: IncrementalRepairInput): IncrementalRepairResult {
  const startTime = Date.now();
  const { event, scenario, baselinePlan, frozenStopIds } = input;
  const travelProvider = input.travelTimeProvider ?? new StraightLineTravelTimeProvider();
  const maxShiftMinutes = input.maxShiftMinutes ?? 480;
  const toleranceMinutes = input.toleranceMinutes ?? 0.1;

  const warnings: string[] = [];
  let candidateRoutes: ResourceRoute[];
  let candidateUnserved: UnservedRequest[] = [...baselinePlan.unserved];
  let affectedResourceIds: string[] = [];
  let updatedScenario: Scenario = { ...scenario };
  let activeProvider = travelProvider;

  // Dispatch based on operational event type
  switch (event.type) {
    case 'REQUEST_CREATED': {
      const newReq = event.request;
      // Add request to scenario if not already present
      if (!updatedScenario.requests.some((r) => r.id === newReq.id)) {
        updatedScenario = {
          ...updatedScenario,
          requests: [...updatedScenario.requests, newReq],
        };
      }

      const insertResult = insertRequestBestFeasible(newReq, updatedScenario, baselinePlan.routes, {
        travelTimeProvider: activeProvider,
        maxShiftMinutes,
        toleranceMinutes,
      });

      if (insertResult.inserted && insertResult.updatedRoute && insertResult.resourceId) {
        affectedResourceIds.push(insertResult.resourceId);
        candidateRoutes = baselinePlan.routes.map((r) =>
          r.resourceId === insertResult.resourceId ? insertResult.updatedRoute! : r,
        );
        // If it was a new route not in baseline
        if (!baselinePlan.routes.some((r) => r.resourceId === insertResult.resourceId)) {
          candidateRoutes.push(insertResult.updatedRoute);
        }
        // Invariant: successful insertion must remove the request from the unserved collection
        candidateUnserved = candidateUnserved.filter((u) => u.requestId !== newReq.id);
      } else {
        // Request cannot be feasibly inserted
        const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
        warnings.push(
          `Request '${newReq.id}' could not be feasibly inserted into any route (${insertResult.unservedReason ?? 'SHIFT_LIMIT_REACHED'})`,
        );
        const unservedIds = Array.from(
          new Set([...candidateUnserved.map((u) => u.requestId), newReq.id]),
        );
        return {
          status: 'NO_FEASIBLE_REPAIR',
          affectedRouteResourceIds: [],
          unchangedRouteResourceIds: baselinePlan.routes.map((r) => r.resourceId),
          unservedRequestIds: unservedIds,
          warnings,
          churn: emptyChurn,
          travelTimeDeltaMinutes: 0,
          repairReason: `Infeasible insertion for ${newReq.id}: ${insertResult.unservedReason ?? 'SHIFT_LIMIT_REACHED'}`,
        };
      }
      break;
    }

    case 'RESOURCE_OFFLINE': {
      // Update scenario resource status to OFFLINE
      updatedScenario = {
        ...updatedScenario,
        resources: updatedScenario.resources.map((r) =>
          r.id === event.resourceId ? { ...r, status: 'OFFLINE' } : r,
        ),
      };

      const offlineResult = repairResourceOffline(
        event.resourceId,
        updatedScenario,
        baselinePlan,
        activeProvider,
        maxShiftMinutes,
        toleranceMinutes,
      );

      warnings.push(...offlineResult.warnings);
      affectedResourceIds = offlineResult.affectedResourceIds;

      if (!offlineResult.success) {
        // Critical conflict (e.g. frozen stops on offline vehicle)
        const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
        return {
          status: 'NO_FEASIBLE_REPAIR',
          affectedRouteResourceIds: affectedResourceIds,
          unchangedRouteResourceIds: baselinePlan.routes
            .map((r) => r.resourceId)
            .filter((id) => !affectedResourceIds.includes(id)),
          unservedRequestIds: baselinePlan.unserved.map((u) => u.requestId),
          warnings,
          churn: emptyChurn,
          travelTimeDeltaMinutes: 0,
          repairReason: `RESOURCE_OFFLINE conflict: ${warnings.join('; ')}`,
        };
      }

      candidateRoutes = offlineResult.repairedRoutes ?? [];
      candidateUnserved = [...candidateUnserved, ...offlineResult.newlyUnserved];
      break;
    }

    case 'REQUEST_CANCELLED': {
      // Update scenario request status to CANCELLED
      updatedScenario = {
        ...updatedScenario,
        requests: updatedScenario.requests.filter((r) => r.id !== event.requestId),
      };

      const cancelResult = repairRequestCancellation(
        event.requestId,
        updatedScenario,
        baselinePlan,
        activeProvider,
        maxShiftMinutes,
        toleranceMinutes,
      );

      if (cancelResult.warning) {
        warnings.push(cancelResult.warning);
      }

      if (!cancelResult.success) {
        const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
        return {
          status: 'NO_FEASIBLE_REPAIR',
          affectedRouteResourceIds: cancelResult.affectedResourceId
            ? [cancelResult.affectedResourceId]
            : [],
          unchangedRouteResourceIds: baselinePlan.routes.map((r) => r.resourceId),
          unservedRequestIds: baselinePlan.unserved.map((u) => u.requestId),
          warnings,
          churn: emptyChurn,
          travelTimeDeltaMinutes: 0,
          repairReason: cancelResult.warning ?? 'Cancellation failed due to frozen commitment',
        };
      }

      candidateRoutes = cancelResult.repairedRoutes ?? [...baselinePlan.routes];
      if (cancelResult.affectedResourceId) {
        affectedResourceIds.push(cancelResult.affectedResourceId);
      }
      // Remove cancelled request from unserved if it was there
      candidateUnserved = candidateUnserved.filter((u) => u.requestId !== event.requestId);
      break;
    }

    case 'ROAD_BLOCKED': {
      const roadResult = repairRoadBlockage(
        event.blockedZone,
        updatedScenario,
        baselinePlan,
        activeProvider,
        maxShiftMinutes,
        toleranceMinutes,
      );

      warnings.push(...roadResult.warnings);
      affectedResourceIds = roadResult.affectedResourceIds;
      activeProvider = roadResult.updatedProvider;

      if (!roadResult.success) {
        const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
        return {
          status: 'NO_FEASIBLE_REPAIR',
          affectedRouteResourceIds: affectedResourceIds,
          unchangedRouteResourceIds: baselinePlan.routes
            .map((r) => r.resourceId)
            .filter((id) => !affectedResourceIds.includes(id)),
          unservedRequestIds: baselinePlan.unserved.map((u) => u.requestId),
          warnings,
          churn: emptyChurn,
          travelTimeDeltaMinutes: 0,
          repairReason: `ROAD_BLOCKED conflict: ${warnings.join('; ')}`,
        };
      }

      candidateRoutes = roadResult.repairedRoutes ?? [...baselinePlan.routes];
      candidateUnserved = [...candidateUnserved, ...roadResult.newlyUnserved];
      break;
    }

    case 'RESOURCE_AVAILABLE': {
      // Mark resource AVAILABLE
      updatedScenario = {
        ...updatedScenario,
        resources: updatedScenario.resources.map((r) =>
          r.id === event.resourceId ? { ...r, status: 'AVAILABLE' } : r,
        ),
      };

      // Try inserting pending unserved requests into this newly available resource
      candidateRoutes = [...baselinePlan.routes];
      const unservedRemaining: UnservedRequest[] = [];
      const reqMap = new Map(updatedScenario.requests.map((r) => [r.id, r]));

      for (const unserved of baselinePlan.unserved) {
        const req = reqMap.get(unserved.requestId);
        if (!req) {
          unservedRemaining.push(unserved);
          continue;
        }

        const insertRes = insertRequestBestFeasible(req, updatedScenario, candidateRoutes, {
          travelTimeProvider: activeProvider,
          maxShiftMinutes,
          toleranceMinutes,
        });

        if (
          insertRes.inserted &&
          insertRes.updatedRoute &&
          insertRes.resourceId === event.resourceId
        ) {
          candidateRoutes = candidateRoutes.filter((r) => r.resourceId !== event.resourceId);
          candidateRoutes.push(insertRes.updatedRoute);
          if (!affectedResourceIds.includes(event.resourceId)) {
            affectedResourceIds.push(event.resourceId);
          }
        } else {
          unservedRemaining.push(unserved);
        }
      }
      candidateUnserved = unservedRemaining;
      break;
    }

    default: {
      const unsupportedEvent = event as { type: string };
      warnings.push(`Unsupported operational event type '${unsupportedEvent.type}'`);
      const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
      return {
        status: 'NO_FEASIBLE_REPAIR',
        affectedRouteResourceIds: [],
        unchangedRouteResourceIds: baselinePlan.routes.map((r) => r.resourceId),
        unservedRequestIds: baselinePlan.unserved.map((u) => u.requestId),
        warnings,
        churn: emptyChurn,
        travelTimeDeltaMinutes: 0,
        repairReason: `Unsupported event type '${unsupportedEvent.type}'`,
      };
    }
  }

  // Filter out any routes that have become completely empty (0 stops)
  const activeRoutes = candidateRoutes.filter((r) => r.stops.length > 0);

  // 1. Gather all served requests across active routes and check for duplicate allocations
  const servedRequestIds = new Set<string>();
  const duplicateServedIds = new Set<string>();
  for (const route of activeRoutes) {
    for (const stop of route.stops) {
      if (stop.type === 'PICKUP' && stop.targetId) {
        if (servedRequestIds.has(stop.targetId)) {
          duplicateServedIds.add(stop.targetId);
        }
        servedRequestIds.add(stop.targetId);
      }
    }
  }

  if (duplicateServedIds.size > 0) {
    const emptyChurn = calculateIncrementalChurn(baselinePlan, baselinePlan);
    return {
      status: 'NO_FEASIBLE_REPAIR',
      affectedRouteResourceIds: affectedResourceIds,
      unchangedRouteResourceIds: baselinePlan.routes
        .map((r) => r.resourceId)
        .filter((id) => !affectedResourceIds.includes(id)),
      unservedRequestIds: baselinePlan.unserved.map((u) => u.requestId),
      warnings: [
        `Duplicate request allocation detected: [${[...duplicateServedIds].join(', ')}] allocated more than once`,
      ],
      churn: emptyChurn,
      travelTimeDeltaMinutes: 0,
      repairReason: 'Integrity violation: duplicate request allocation',
    };
  }

  // 2. Invariant: Maintain one consistent classification for each request.
  // A request must never be counted as simultaneously served and unserved.
  // Filter out any served requests from candidateUnserved.
  const finalUnserved: UnservedRequest[] = [];
  const seenUnserved = new Set<string>();

  for (const u of candidateUnserved) {
    if (servedRequestIds.has(u.requestId)) {
      // Successfully served; cannot be in unserved list
      continue;
    }
    if (!seenUnserved.has(u.requestId)) {
      seenUnserved.add(u.requestId);
      finalUnserved.push(u);
    }
  }

  // Ensure every unserved request in updatedScenario is cataloged
  for (const req of updatedScenario.requests) {
    if (!servedRequestIds.has(req.id) && !seenUnserved.has(req.id)) {
      seenUnserved.add(req.id);
      finalUnserved.push({
        requestId: req.id,
        reason: 'UNASSIGNED',
        details: 'Unassigned request in scenario snapshot',
      });
    }
  }

  // Compute metrics for the proposed candidate plan
  const solveDuration = Date.now() - startTime;
  const metrics = calculatePlanMetrics(
    updatedScenario,
    { routes: activeRoutes, unserved: finalUnserved },
    solveDuration,
  );

  const candidatePlan: SolverPlan = {
    scenarioId: updatedScenario.id,
    calculatedAt: new Date().toISOString(),
    solverStatus: 'PROPOSED_INCREMENTAL_REPAIR',
    routes: activeRoutes,
    unserved: finalUnserved,
    metrics,
  };

  // Critical safety check 1: Enforce frozen stop preservation
  const frozenCheck = validateFrozenStopsPreserved(baselinePlan, candidatePlan, frozenStopIds);
  if (!frozenCheck.valid) {
    warnings.push(...frozenCheck.errors);
    const churn = calculateIncrementalChurn(baselinePlan, candidatePlan);
    return {
      status: 'NO_FEASIBLE_REPAIR',
      affectedRouteResourceIds: affectedResourceIds,
      unchangedRouteResourceIds: baselinePlan.routes
        .map((r) => r.resourceId)
        .filter((id) => !affectedResourceIds.includes(id)),
      unservedRequestIds: finalUnserved.map((u) => u.requestId),
      warnings,
      churn,
      travelTimeDeltaMinutes: 0,
      repairReason: `Frozen stop violation: ${frozenCheck.errors.join('; ')}`,
    };
  }

  // Critical safety check 2: Independent Plan Validation
  const planValidation = validateSolverPlan(updatedScenario, candidatePlan, {
    allowFrozen: true,
    travelTimeProvider: activeProvider,
    maxShiftMinutes,
    toleranceMinutes,
  });

  if (!planValidation.valid) {
    warnings.push(...planValidation.errors);
    const churn = calculateIncrementalChurn(baselinePlan, candidatePlan);
    return {
      status: 'NO_FEASIBLE_REPAIR',
      affectedRouteResourceIds: affectedResourceIds,
      unchangedRouteResourceIds: baselinePlan.routes
        .map((r) => r.resourceId)
        .filter((id) => !affectedResourceIds.includes(id)),
      unservedRequestIds: finalUnserved.map((u) => u.requestId),
      warnings,
      churn,
      travelTimeDeltaMinutes: 0,
      repairReason: `Candidate plan failed physical validation: ${planValidation.errors.join('; ')}`,
    };
  }

  // Calculate detailed churn between baseline and candidate
  const churn = calculateIncrementalChurn(
    baselinePlan,
    candidatePlan,
    frozenStopIds ? new Set(frozenStopIds) : undefined,
  );

  const baseTravel = baselinePlan.metrics?.totalTravelTimeMinutes ?? 0;
  const newTravel = candidatePlan.metrics.totalTravelTimeMinutes;
  const travelTimeDeltaMinutes = Number((newTravel - baseTravel).toFixed(2));

  // Determine unchanged routes
  const unchangedResourceIds = baselinePlan.routes
    .map((r) => r.resourceId)
    .filter((id) => !affectedResourceIds.includes(id));

  return {
    status: 'PROPOSED',
    repairedPlan: candidatePlan,
    affectedRouteResourceIds: affectedResourceIds,
    unchangedRouteResourceIds: unchangedResourceIds,
    unservedRequestIds: finalUnserved.map((u) => u.requestId),
    warnings,
    churn,
    travelTimeDeltaMinutes,
    repairReason: `Successfully generated incremental candidate proposal for ${event.type}`,
  };
}
