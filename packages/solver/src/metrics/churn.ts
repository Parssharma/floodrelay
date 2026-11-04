import type { RouteStop, SolverPlan } from '@floodrelay/shared';
import type { IncrementalChurnMetrics } from '../incremental/types.js';

/**
 * Calculates deterministic assignment churn between a baseline plan and an updated proposal.
 *
 * Churn Definition:
 * - Comparable Existing Assignments (Denominator):
 *   The set of distinct requests that were served in the baseline plan (S_baseline).
 *   New requests (e.g. from REQUEST_CREATED) were not present in S_baseline and do NOT enter the denominator.
 *
 * - Changed Existing Assignments (Numerator):
 *   Requests r in S_baseline that either:
 *   1. Are reassigned to a different resource in the updated plan (reassignedRequestsCount).
 *   2. Are newly unserved in the updated plan (newlyUnservedRequestsCount).
 *
 * - Churn Rate:
 *   If comparableExistingAssignments === 0:
 *     assignmentChurnRate = 0.0
 *   Else:
 *     assignmentChurnRate = (reassignedRequestsCount + newlyUnservedRequestsCount) / comparableExistingAssignments
 *   churnPercent = Number((assignmentChurnRate * 100).toFixed(2))
 *
 * - Secondary granular components reported separately:
 *   - reorderedStopsCount: requests that stayed on the same resource but whose relative sequence or index changed.
 *   - newlyServedRequestsCount: requests unserved in baseline that became served in updated plan.
 *   - travelTimeDeltaMinutes: updatedPlan.totalTravelTime - baselinePlan.totalTravelTime.
 *   - travelDistanceDeltaKm: updatedPlan.totalTravelDistance - baselinePlan.totalTravelDistance.
 *   - frozenStopsViolated: number of frozen stops that were altered, removed, or moved.
 */
export function calculateIncrementalChurn(
  baselinePlan: SolverPlan,
  updatedPlan: SolverPlan,
  frozenStopKeys?: ReadonlySet<string>,
): IncrementalChurnMetrics {
  // Map of requestId -> { resourceId, stopNumber, sequenceIndex } in baseline
  const baselineAssignments = new Map<
    string,
    { resourceId: string; stopNumber: number; seq: number }
  >();
  const baselineFrozenStops = new Map<string, RouteStop>();

  for (const route of baselinePlan.routes) {
    let pickupSeq = 0;
    for (const stop of route.stops) {
      if (stop.type === 'PICKUP' && stop.targetId) {
        baselineAssignments.set(stop.targetId, {
          resourceId: route.resourceId,
          stopNumber: stop.stopNumber,
          seq: pickupSeq++,
        });
      }
      const isFrozen = Boolean(
        stop.isFrozen ||
        (frozenStopKeys &&
          (frozenStopKeys.has(stop.targetId) ||
            frozenStopKeys.has(`${route.resourceId}:${stop.targetId}`) ||
            frozenStopKeys.has(`${route.resourceId}:${stop.targetId}:${stop.stopNumber}`))),
      );
      // Only track PICKUP and DROPOFF stops as frozen violations.
      // DEPOT stops are structural route bookmarks that may be legitimately
      // renumbered or reconstructed by a full re-solve without constituting
      // a rescue-commitment safety violation.
      if (isFrozen && stop.type !== 'DEPOT') {
        baselineFrozenStops.set(`${route.resourceId}:${stop.targetId}`, stop);
      }
    }
  }

  // Map of requestId -> { resourceId, stopNumber, sequenceIndex } in updated plan
  const updatedAssignments = new Map<
    string,
    { resourceId: string; stopNumber: number; seq: number }
  >();
  for (const route of updatedPlan.routes) {
    let pickupSeq = 0;
    for (const stop of route.stops) {
      if (stop.type === 'PICKUP' && stop.targetId) {
        updatedAssignments.set(stop.targetId, {
          resourceId: route.resourceId,
          stopNumber: stop.stopNumber,
          seq: pickupSeq++,
        });
      }
    }
  }

  const reassignedRequestIds: string[] = [];
  const newlyUnservedRequestIds: string[] = [];
  const reorderedStopKeys: string[] = [];

  // Evaluate baseline requests
  for (const [reqId, baselineInfo] of baselineAssignments.entries()) {
    const updatedInfo = updatedAssignments.get(reqId);
    if (!updatedInfo) {
      newlyUnservedRequestIds.push(reqId);
    } else if (updatedInfo.resourceId !== baselineInfo.resourceId) {
      reassignedRequestIds.push(reqId);
    } else if (
      updatedInfo.seq !== baselineInfo.seq ||
      updatedInfo.stopNumber !== baselineInfo.stopNumber
    ) {
      reorderedStopKeys.push(`${baselineInfo.resourceId}:${reqId}`);
    }
  }

  // Evaluate newly served requests
  const newlyServedRequestIds: string[] = [];
  for (const reqId of updatedAssignments.keys()) {
    if (!baselineAssignments.has(reqId)) {
      newlyServedRequestIds.push(reqId);
    }
  }

  // Evaluate frozen stop violations.
  // A frozen-stop VIOLATION means: the resource is still operational (its route exists
  // in the updated plan) but its frozen commitment was illegally mutated, removed, or
  // renumbered. If the resource has gone offline its route is entirely absent from the
  // updated plan — that is a legitimate operational event, not an invariant violation.
  let frozenStopsViolated = 0;
  for (const [key, prevStop] of baselineFrozenStops.entries()) {
    const [resId, targetId] = key.split(':');
    const updatedRoute = updatedPlan.routes.find((r) => r.resourceId === resId);

    // Resource went offline — its route is absent entirely from the updated plan.
    // This is a legitimate operational event; do not count as a frozen-stop violation.
    if (!updatedRoute) {
      continue;
    }

    const updatedStop = updatedRoute.stops.find(
      (s) => s.targetId === targetId && s.type === prevStop.type,
    );

    if (
      !updatedStop ||
      updatedStop.stopNumber !== prevStop.stopNumber ||
      updatedStop.passengersPickedUp !== prevStop.passengersPickedUp ||
      updatedStop.passengersDroppedOff !== prevStop.passengersDroppedOff
    ) {
      frozenStopsViolated++;
    }
  }

  // Denominator is the comparable baseline served requests count
  const comparableExistingAssignments = baselineAssignments.size;
  const reassignedRequestsCount = reassignedRequestIds.length;
  const newlyUnservedRequestsCount = newlyUnservedRequestIds.length;
  const reorderedStopsCount = reorderedStopKeys.length;
  const newlyServedRequestsCount = newlyServedRequestIds.length;

  const totalDisrupted = reassignedRequestsCount + newlyUnservedRequestsCount;
  const assignmentChurnRate =
    comparableExistingAssignments === 0 ? 0.0 : totalDisrupted / comparableExistingAssignments;
  const churnPercent = Number((assignmentChurnRate * 100).toFixed(2));

  const baseTravelMinutes = baselinePlan.metrics?.totalTravelTimeMinutes ?? 0;
  const updatedTravelMinutes = updatedPlan.metrics?.totalTravelTimeMinutes ?? 0;
  const travelTimeDeltaMinutes = Number((updatedTravelMinutes - baseTravelMinutes).toFixed(2));

  const baseDistanceKm = baselinePlan.metrics?.totalTravelDistanceKm ?? 0;
  const updatedDistanceKm = updatedPlan.metrics?.totalTravelDistanceKm ?? 0;
  const travelDistanceDeltaKm = Number((updatedDistanceKm - baseDistanceKm).toFixed(2));

  // Sort IDs deterministically
  reassignedRequestIds.sort();
  newlyUnservedRequestIds.sort();
  reorderedStopKeys.sort();
  newlyServedRequestIds.sort();

  return {
    comparableExistingAssignments,
    reassignedRequestsCount,
    reorderedStopsCount,
    newlyServedRequestsCount,
    newlyUnservedRequestsCount,
    travelTimeDeltaMinutes,
    travelDistanceDeltaKm,
    frozenStopsViolated,
    assignmentChurnRate,
    churnPercent,
    reassignedRequestIds,
    reorderedStopKeys,
    newlyServedRequestIds,
    newlyUnservedRequestIds,
  };
}
