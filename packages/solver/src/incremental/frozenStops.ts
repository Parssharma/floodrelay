import type { SolverPlan } from '@floodrelay/shared';
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

export const FROZEN_STOP_COORDINATE_TOLERANCE = 1e-4; // ~11 meters, matches backend DB validator

/**
 * Validates that all frozen stops from the baseline plan are strictly preserved
 * in the proposed repaired plan.
 *
 * Checks:
 * 1. Every baseline frozen stop exists in the candidate plan under the same resourceId.
 * 2. Stop type, targetId, passenger counts, and coordinates match within tolerance.
 * 3. Stop number (position) and relative ordering are strictly preserved.
 * 4. No candidate frozen stop has isFrozen unset or false.
 * 5. No candidate route drops or reassigns a frozen stop to another resource.
 * 6. No candidate route duplicates a frozen stop.
 * 7. Entire routes containing frozen work cannot be silently dropped.
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
        `Resource '${resId}' with ${expectedStops.length} frozen stop(s) is missing entirely from candidate plan (cannot drop committed route)`,
      );
      continue;
    }

    // 1. Check for duplicated frozen stops on this route
    for (const exp of expectedStops) {
      // For requests (PICKUP), a target cannot appear more than once on the route
      if (exp.type === 'PICKUP') {
        const allPickups = candidateRoute.stops.filter(
          (s) => s.targetId === exp.targetId && s.type === 'PICKUP',
        );
        if (allPickups.length > 1) {
          errors.push(
            `Frozen stop for target '${exp.targetId}' is duplicated ${allPickups.length} times on resource '${resId}'`,
          );
        }
      }

      // No other frozen stop can duplicate this expected frozen stop at another position
      const otherFrozen = candidateRoute.stops.filter(
        (s) =>
          Boolean(s.isFrozen) &&
          s.stopNumber !== exp.stopNumber &&
          s.targetId === exp.targetId &&
          s.type === exp.type,
      );
      if (otherFrozen.length > 0) {
        errors.push(
          `Frozen stop for target '${exp.targetId}' is duplicated at multiple positions on resource '${resId}'`,
        );
      }
    }

    // 2. Check each expected frozen stop by exact stopNumber and invariants
    for (const exp of expectedStops) {
      const candStop = candidateRoute.stops.find((s) => s.stopNumber === exp.stopNumber);
      if (!candStop) {
        errors.push(
          `Frozen stop #${exp.stopNumber} for target '${exp.targetId}' on resource '${resId}' is missing at expected stop position`,
        );
        continue;
      }

      if (candStop.targetId !== exp.targetId) {
        errors.push(
          `Frozen stop #${exp.stopNumber} on resource '${resId}' modified targetId (candidate '${candStop.targetId}' != baseline '${exp.targetId}')`,
        );
      }

      if (candStop.type !== exp.type) {
        errors.push(
          `Frozen stop #${exp.stopNumber} for target '${exp.targetId}' on resource '${resId}' modified stop type (candidate '${candStop.type}' != baseline '${exp.type}')`,
        );
      }

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

      const latDiff = Math.abs(candStop.lat - exp.lat);
      const lngDiff = Math.abs(candStop.lng - exp.lng);
      if (
        latDiff > FROZEN_STOP_COORDINATE_TOLERANCE ||
        lngDiff > FROZEN_STOP_COORDINATE_TOLERANCE
      ) {
        errors.push(
          `Frozen stop #${exp.stopNumber} for target '${exp.targetId}' on resource '${resId}' modified coordinates (candidate: ${candStop.lat}, ${candStop.lng} vs baseline: ${exp.lat}, ${exp.lng})`,
        );
      }
    }

    // 3. Verify relative sequence
    let expectedIdx = 0;
    for (let cIdx = 0; cIdx < candidateRoute.stops.length; cIdx++) {
      const candStop = candidateRoute.stops[cIdx]!;
      if (expectedIdx >= expectedStops.length) break;

      const exp = expectedStops[expectedIdx]!;
      if (candStop.targetId === exp.targetId && candStop.type === exp.type) {
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

  // 4. Check that no frozen pickup request was reassigned to a different resource in candidate
  for (const exp of baselineFrozen) {
    if (exp.type !== 'PICKUP') continue; // Shelters (DROPOFF) can legitimately be visited by multiple vehicles
    for (const otherRoute of candidatePlan.routes) {
      if (otherRoute.resourceId === exp.resourceId) continue;
      const stolenStop = otherRoute.stops.find(
        (s) => s.targetId === exp.targetId && s.type === 'PICKUP',
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
