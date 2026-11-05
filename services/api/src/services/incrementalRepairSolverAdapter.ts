/**
 * IncrementalRepairSolverAdapter
 *
 * Implements the RepairSolver interface defined by Phase 5 Part 1 and bridges it to the
 * pure incremental solver algorithms implemented in Phase 5 Part 2
 * (packages/solver/src/incremental/).
 *
 * Responsibilities:
 * - Load the baseline SolverPlan from the database when baselineAssignmentId is provided.
 * - Apply authoritative isFrozen flags using the FrozenStopReference list from Part 1.
 * - Convert the Part 1 OperationalEvent DB row to the Part 2 solver discriminated union.
 * - Invoke repairIncrementally() from the pure solver library.
 * - Map IncrementalRepairResult back to the RepairResult contract.
 *
 * Invariants enforced by this adapter:
 * - The adapter never commits assignments or modifies database state; that responsibility
 *   belongs to RepairOrchestrationService.
 * - Frozen stop violations propagate as NO_FEASIBLE_REPAIR.
 * - Zero Express, session-state, or HTTP dependencies within this file.
 */

import type {
  RepairInput,
  RepairResult,
  FrozenStopReference,
  SolverPlan,
} from '@floodrelay/shared';
import type { PostgisRepository } from '../db/repository.js';
import { dbToRouteStop } from '../db/schema.js';
import { repairIncrementally } from '@floodrelay/solver';
import type {
  IncrementalRepairInput,
  OperationalEvent as SolverOperationalEvent,
} from '@floodrelay/solver';
import type { RepairSolver } from './repairOrchestrationService.js';
import type { DbOperationalEvent } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reconstruct a SolverPlan from an assignment + its stops, applying the
 * authoritative frozen-stop flags from the Part 1 FrozenStopReference list.
 */
function dbAssignmentToSolverPlan(
  assignment: { id: string; scenario_id: string | null; metrics: unknown; unserved: unknown },
  stops: Parameters<typeof dbToRouteStop>[0][],
  frozenStops: ReadonlyArray<FrozenStopReference>,
): SolverPlan {
  // Build a frozen lookup keyed by resourceId:stopNumber (authoritative from Part 1)
  const frozenSet = new Set<string>(frozenStops.map((fs) => `${fs.resourceId}:${fs.stopNumber}`));

  // Group stops by resourceId maintaining DB ordering (resource_id ASC, stop_number ASC)
  const routeMap = new Map<string, Parameters<typeof dbToRouteStop>[0][]>();
  for (const stop of stops) {
    const existing = routeMap.get(stop.resource_id) ?? [];
    existing.push(stop);
    routeMap.set(stop.resource_id, existing);
  }

  const routes: SolverPlan['routes'] = Array.from(routeMap.entries()).map(
    ([resourceId, dbStops]) => {
      const routeStops = dbStops.map((s) => {
        const rs = dbToRouteStop(s);
        const isFrozenByRef = frozenSet.has(`${resourceId}:${s.stop_number}`);
        return { ...rs, isFrozen: isFrozenByRef || rs.isFrozen };
      });

      const servedRequestIds = routeStops.filter((s) => s.type === 'PICKUP').map((s) => s.targetId);

      const totalDurationMinutes =
        routeStops.length > 0 ? routeStops[routeStops.length - 1]!.estimatedArrivalMinutes : 0;

      // Approximate travel distance using straight-line segments between stops
      let totalTravelDistanceKm = 0;
      for (let i = 1; i < routeStops.length; i++) {
        const a = routeStops[i - 1]!;
        const b = routeStops[i]!;
        const dLat = ((b.lat - a.lat) * Math.PI) / 180;
        const dLng = ((b.lng - a.lng) * Math.PI) / 180;
        const sinDLat = Math.sin(dLat / 2);
        const sinDLng = Math.sin(dLng / 2);
        const hav =
          sinDLat * sinDLat +
          Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
        totalTravelDistanceKm += 2 * 6371 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
      }

      return {
        resourceId,
        stops: routeStops,
        totalDurationMinutes,
        totalTravelDistanceKm,
        servedRequestIds,
      };
    },
  );

  const metrics =
    typeof assignment.metrics === 'object' && assignment.metrics !== null
      ? (assignment.metrics as SolverPlan['metrics'])
      : {
          coveragePercent: 0,
          totalTravelTimeMinutes: 0,
          totalTravelDistanceKm: 0,
          highPriorityWaitTimeMinutes: 0,
          solveDurationMs: 0,
          servedRequestsCount: routes.reduce((acc, r) => acc + r.servedRequestIds.length, 0),
          unservedRequestsCount: 0,
        };

  const unserved = Array.isArray(assignment.unserved)
    ? (assignment.unserved as SolverPlan['unserved'])
    : [];

  return {
    scenarioId: assignment.scenario_id ?? `baseline-${assignment.id}`,
    calculatedAt: new Date().toISOString(),
    solverStatus: 'SOLVER_STATUS_OPTIMAL',
    routes,
    unserved,
    metrics,
  };
}

/**
 * Returns an empty baseline plan when no prior assignment exists.
 * All requests are treated as unserved/pending.
 */
function emptyBaselinePlan(
  scenarioId: string,
  scenarioSnapshot: RepairInput['scenarioSnapshot'],
): SolverPlan {
  return {
    scenarioId,
    calculatedAt: new Date().toISOString(),
    solverStatus: 'SOLVER_STATUS_OPTIMAL',
    routes: scenarioSnapshot.resources.map((r) => ({
      resourceId: r.id,
      stops: [],
      totalDurationMinutes: 0,
      totalTravelDistanceKm: 0,
      servedRequestIds: [],
    })),
    unserved: scenarioSnapshot.requests.map((req) => ({
      requestId: req.id,
      reason: 'UNASSIGNED' as const,
    })),
    metrics: {
      coveragePercent: 0,
      totalTravelTimeMinutes: 0,
      totalTravelDistanceKm: 0,
      highPriorityWaitTimeMinutes: 0,
      solveDurationMs: 0,
      servedRequestsCount: 0,
      unservedRequestsCount: scenarioSnapshot.requests.length,
    },
  };
}

/**
 * Map a Part 1 DbOperationalEvent to the Part 2 solver's discriminated event union.
 *
 * Returns null for event types that have no Part 2 solver handler (ROAD_REOPENED,
 * unrecognised types), which the caller converts to NO_FEASIBLE_REPAIR.
 */
function mapDbEventToSolverEvent(
  eventRow: DbOperationalEvent,
  scenarioSnapshot: RepairInput['scenarioSnapshot'],
): SolverOperationalEvent | null {
  const id = eventRow.entity_id;
  const timestamp = new Date().toISOString();
  const payload = eventRow.payload ?? {};

  switch (eventRow.event_type) {
    case 'REQUEST_CREATED': {
      const req = scenarioSnapshot.requests.find((r) => r.id === eventRow.entity_id);
      if (!req) return null;
      return { id, type: 'REQUEST_CREATED', timestamp, request: req };
    }

    case 'REQUEST_CANCELLED': {
      return {
        id,
        type: 'REQUEST_CANCELLED',
        timestamp,
        requestId: eventRow.entity_id,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
        isDuplicateResolution:
          typeof payload.isDuplicateResolution === 'boolean'
            ? payload.isDuplicateResolution
            : undefined,
      };
    }

    case 'REQUEST_FLAGGED_DUPLICATE': {
      // The solver treats a duplicate flag as a cancellation of the duplicate request
      return {
        id,
        type: 'REQUEST_CANCELLED',
        timestamp,
        requestId: eventRow.entity_id,
        isDuplicateResolution: true,
        reason: 'Flagged as duplicate',
      };
    }

    case 'RESOURCE_OFFLINE': {
      return {
        id,
        type: 'RESOURCE_OFFLINE',
        timestamp,
        resourceId: eventRow.entity_id,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      };
    }

    case 'RESOURCE_AVAILABLE': {
      return {
        id,
        type: 'RESOURCE_AVAILABLE',
        timestamp,
        resourceId: eventRow.entity_id,
      };
    }

    case 'ROAD_BLOCKED': {
      // Look up the blocked zone in the scenario snapshot
      const zone = scenarioSnapshot.blockedZones?.find((z) => z.id === eventRow.entity_id);
      if (!zone) return null;
      return { id, type: 'ROAD_BLOCKED', timestamp, blockedZone: zone };
    }

    case 'ROAD_REOPENED':
      // No Part 2 handler for road-reopening events
      return null;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

/**
 * Bridges the Part 1 RepairSolver interface to the Part 2 incremental repair algorithms.
 * This adapter is instantiated by app.ts and injected into RepairOrchestrationService,
 * replacing the Part 1 503 REPAIR_ENGINE_UNAVAILABLE stub.
 */
export class IncrementalRepairSolverAdapter implements RepairSolver {
  constructor(private readonly repo: PostgisRepository) {}

  async solveRepair(input: RepairInput): Promise<RepairResult> {
    const {
      eventId,
      baselineAssignmentId,
      scenarioSnapshot,
      frozenStops,
      affectedRequestIds,
      affectedResourceIds,
      expectedVersion,
    } = input;

    // --- 1. Load the operational event record ---
    const eventRow = await this.repo.getOperationalEvent(eventId);
    if (!eventRow) {
      return {
        status: 'NO_FEASIBLE_REPAIR',
        unservedRequestIds: scenarioSnapshot.requests.map((r) => r.id),
        warnings: [`Operational event "${eventId}" not found; cannot determine repair action`],
      };
    }

    // --- 2. Load or construct the baseline SolverPlan ---
    let baselinePlan: SolverPlan;

    if (baselineAssignmentId) {
      const dbAssignment = await this.repo.getAssignmentWithStops(baselineAssignmentId);
      if (!dbAssignment) {
        return {
          status: 'NO_FEASIBLE_REPAIR',
          unservedRequestIds: scenarioSnapshot.requests.map((r) => r.id),
          warnings: [
            `Baseline assignment "${baselineAssignmentId}" not found; cannot perform incremental repair`,
          ],
        };
      }
      baselinePlan = dbAssignmentToSolverPlan(
        dbAssignment.assignment,
        dbAssignment.stops,
        frozenStops,
      );
    } else {
      baselinePlan = emptyBaselinePlan(`operational-snapshot-${eventId}`, scenarioSnapshot);
    }

    // --- 3. Map the DB event to the solver's discriminated event union ---
    const solverEvent = mapDbEventToSolverEvent(eventRow, scenarioSnapshot);

    if (!solverEvent) {
      return {
        status: 'NO_FEASIBLE_REPAIR',
        unservedRequestIds: [],
        warnings: [`Event type "${eventRow.event_type}" has no Part 2 incremental repair handler`],
        baselineVersion: expectedVersion,
      };
    }

    // --- 4. Build frozen stop key set ---
    // Use the most specific key form (resourceId:targetId:stopNumber) so the solver
    // can identify individual stops precisely.
    const frozenStopIds: string[] = frozenStops.map(
      (fs) => `${fs.resourceId}:${fs.targetId}:${fs.stopNumber}`,
    );

    // --- 5. Build IncrementalRepairInput ---
    const repairInput: IncrementalRepairInput = {
      event: solverEvent,
      scenario: scenarioSnapshot,
      baselinePlan,
      frozenStopIds,
      affectedRequestIds: affectedRequestIds.length > 0 ? affectedRequestIds : undefined,
      affectedResourceIds: affectedResourceIds.length > 0 ? affectedResourceIds : undefined,
      // travelTimeProvider defaults to StraightLineTravelTimeProvider inside repairIncrementally
    };

    // --- 6. Run the pure incremental solver ---
    let solverResult;
    try {
      solverResult = repairIncrementally(repairInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'NO_FEASIBLE_REPAIR',
        unservedRequestIds: scenarioSnapshot.requests.map((r) => r.id),
        warnings: [`Solver threw an unexpected error during repair: ${message}`],
        baselineVersion: expectedVersion,
      };
    }

    // --- 7. Map IncrementalRepairResult → RepairResult ---
    if (solverResult.status === 'NO_FEASIBLE_REPAIR' || !solverResult.repairedPlan) {
      return {
        status: 'NO_FEASIBLE_REPAIR',
        unservedRequestIds: solverResult.unservedRequestIds,
        warnings: solverResult.warnings,
        baselineVersion: expectedVersion,
      };
    }

    return {
      status: 'PROPOSED',
      proposedPlan: solverResult.repairedPlan,
      unservedRequestIds: solverResult.unservedRequestIds,
      warnings: solverResult.warnings,
      baselineVersion: expectedVersion,
    };
  }
}
