import type { RouteStop, SolverPlan } from '@floodrelay/shared';
import type { FrozenStopRecord, FrozenValidationResult } from './types.js';

/**
 * Extracts all frozen stop records from a plan.
 */
export function extractFrozenStops(
  plan: SolverPlan,
  frozenStopKeys?: ReadonlyArray<string>,
): FrozenStopRecord[] {
  const explicitKeys = new Set(frozenStopKeys ?? []);
  const records: FrozenStopRecord[] = [];

  for (const route of plan.routes) {
    for (const stop of route.stops) {
      const isExplicitlyFrozen =
        Boolean(stop.isFrozen) ||
        explicitKeys.has(stop.targetId) ||
        explicitKeys.has(`${route.resourceId}:${stop.targetId}`) ||
        explicitKeys.has(`${route.resourceId}:${stop.targetId}:${stop.stopNumber}`);

      if (isExplicitlyFrozen) {
        records.push({
          resourceId: route.resourceId,
          stopNumber: stop.stopNumber,
          type: stop.type,
          targetId: stop.targetId,
          lat: stop.lat,
          lng: stop.lng,
          passengersPickedUp: stop.passengersPickedUp ?? 0,
          passengersDroppedOff: stop.passengersDroppedOff ?? 0,
          isFrozen: true,
        });
      }
    }
  }

  return records;
}

/**
 * Validates that all frozen stops from the baseline plan are strictly preserved
 * in the proposed repaired plan.
 *
 * Checks:
 * 1. Every baseline frozen stop exists in the candidate plan under the same resourceId.
 * 2. Stop type, targetId, passenger counts, and coordinates match exactly.
 * 3. The relative ordering of frozen stops within each resource route is strictly preserved.
 * 4. No candidate frozen stop has isFrozen unset or false.
 * 5. No candidate route drops or reassigns a frozen stop to another resource.
 */
export function validateFrozenStopsPreserved(
  baselinePlan: SolverPlan,
  candidatePlan: SolverPlan,
  frozenStopKeys?: ReadonlyArray<string>,
): FrozenValidationResult {
  const errors: string[] = [];
  const baselineFrozen = extractFrozenStops(baselinePlan, frozenStopKeys);

  if (baselineFrozen.length === 0) {
    return { valid: true, violationsCount: 0, errors: [] };
  }

  // Group baseline frozen stops by resourceId, preserving order
  const baselineByResource = new Map<string, FrozenStopRecord[]>();
  for (const stop of baselineFrozen) {
    const list = baselineByResource.get(stop.resourceId) ?? [];
    list.push(stop);
    baselineByResource.set(stop.resourceId, list);
  }

  // Index candidate routes
  const candidateRoutesByResource = new Map(candidatePlan.routes.map((r) => [r.resourceId, r]));

  // Check that candidate plan preserves every baseline frozen stop
  for (const [resId, expectedStops] of baselineByResource.entries()) {
    const candidateRoute = candidateRoutesByResource.get(resId);
    if (!candidateRoute) {
      errors.push(
        `Resource '${resId}' with ${expectedStops.length} frozen stop(s) is missing entirely from candidate plan`,
      );
      continue;
    }

    // Extract frozen stops from candidate route
    const candidateFrozenStops: RouteStop[] = [];
    for (const stop of candidateRoute.stops) {
      const isCandidateFrozen =
        Boolean(stop.isFrozen) ||
        (frozenStopKeys &&
          (frozenStopKeys.includes(stop.targetId) ||
            frozenStopKeys.includes(`${resId}:${stop.targetId}`)));
      if (isCandidateFrozen) {
        candidateFrozenStops.push(stop);
      }
    }

    if (candidateFrozenStops.length < expectedStops.length) {
      errors.push(
        `Resource '${resId}' is missing frozen stops: expected ${expectedStops.length}, candidate route has ${candidateFrozenStops.length}`,
      );
    }

    // Verify relative ordering and field fidelity
    let expectedIdx = 0;
    for (let cIdx = 0; cIdx < candidateRoute.stops.length; cIdx++) {
      const candStop = candidateRoute.stops[cIdx]!;
      if (expectedIdx >= expectedStops.length) break;

      const exp = expectedStops[expectedIdx]!;
      if (candStop.targetId === exp.targetId && candStop.type === exp.type) {
        // Matched targetId and type
        if (!candStop.isFrozen) {
          errors.push(
            `Frozen stop '${exp.targetId}' on resource '${resId}' was unfrozen in candidate plan`,
          );
        }
        if (candStop.passengersPickedUp !== exp.passengersPickedUp) {
          errors.push(
            `Frozen stop '${exp.targetId}' on resource '${resId}' modified passengersPickedUp (${candStop.passengersPickedUp} != ${exp.passengersPickedUp})`,
          );
        }
        if (candStop.passengersDroppedOff !== exp.passengersDroppedOff) {
          errors.push(
            `Frozen stop '${exp.targetId}' on resource '${resId}' modified passengersDroppedOff (${candStop.passengersDroppedOff} != ${exp.passengersDroppedOff})`,
          );
        }
        expectedIdx++;
      }
    }

    if (expectedIdx < expectedStops.length) {
      const missingTargets = expectedStops.slice(expectedIdx).map((s) => s.targetId);
      errors.push(
        `Resource '${resId}' failed relative sequence or dropped frozen stops: [${missingTargets.join(', ')}]`,
      );
    }
  }

  // Also check that no frozen stop was reassigned to a different resource in candidate
  for (const exp of baselineFrozen) {
    for (const otherRoute of candidatePlan.routes) {
      if (otherRoute.resourceId === exp.resourceId) continue;
      const stolenStop = otherRoute.stops.find(
        (s) => s.targetId === exp.targetId && s.type === exp.type,
      );
      if (stolenStop) {
        errors.push(
          `Frozen stop '${exp.targetId}' was reassigned from resource '${exp.resourceId}' to resource '${otherRoute.resourceId}'`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    violationsCount: errors.length,
    errors,
  };
}
