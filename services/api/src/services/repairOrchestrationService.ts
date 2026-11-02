import crypto from 'node:crypto';
import type {
  RepairInput,
  RepairResult,
  FrozenStopReference,
  Scenario,
  SolverPlan,
  GeoPoint,
} from '@floodrelay/shared';
import type { PostgisRepository } from '../db/repository.js';
import {
  parsePointWkt,
  dbToBlockedZone,
  routeStopToDb,
  type DbAssignmentStop,
} from '../db/schema.js';
import {
  computeBoundingBoxFromPoints,
  deriveRegionFromCoordinates,
  classifyScenarioProvenance,
} from './assignmentService.js';

export interface RepairSolver {
  solveRepair(input: RepairInput): Promise<RepairResult>;
}

export class RepairOrchestrationService {
  constructor(
    private readonly repo: PostgisRepository,
    private readonly repairSolver?: RepairSolver,
  ) {}

  /**
   * Orchestrates an incremental plan repair triggered by an operational event.
   * In Phase 5 Part 1, returns REPAIR_ENGINE_UNAVAILABLE if no repair solver is injected.
   */
  async orchestrateRepair(
    eventId: string,
    options?: {
      baselineAssignmentId?: string | null;
      expectedVersion?: number;
    },
  ): Promise<RepairResult> {
    if (!this.repairSolver) {
      const err = new Error(
        'Incremental repair engine is not available. Part 1 establishes backend contracts; solver integration is reserved for Part 2.',
      );
      (err as unknown as { code: string; statusCode: number }).code = 'REPAIR_ENGINE_UNAVAILABLE';
      (err as unknown as { code: string; statusCode: number }).statusCode = 503;
      throw err;
    }

    const eventRow = await this.repo.getOperationalEvent(eventId);
    if (!eventRow) {
      const err = new Error(`Operational event with id "${eventId}" not found`);
      (err as unknown as { code: string; statusCode: number }).code = 'NOT_FOUND';
      (err as unknown as { code: string; statusCode: number }).statusCode = 404;
      throw err;
    }

    // Concurrency guard: expected-version verification
    if (
      options?.expectedVersion !== undefined &&
      eventRow.entity_version !== options.expectedVersion
    ) {
      const err = new Error(
        `Version conflict: operational event "${eventId}" has version ${eventRow.entity_version}, but caller expected ${options.expectedVersion}`,
      );
      (err as unknown as { code: string; statusCode: number }).code = 'VERSION_CONFLICT';
      (err as unknown as { code: string; statusCode: number }).statusCode = 409;
      throw err;
    }

    // Complete safety snapshot loading: no arbitrary limits
    const requests = await this.repo.listRequests();
    const resources = await this.repo.listResources();
    const shelters = await this.repo.listShelters();
    const rawBlockedZones = await this.repo.listBlockedZones(true);
    const blockedZones = rawBlockedZones.map(dbToBlockedZone);

    // Fail-closed safety check: ensure affected entity is present in the loaded state
    if (eventRow.entity_type === 'REQUEST' && !requests.some((r) => r.id === eventRow.entity_id)) {
      const err = new Error(
        `Safety-critical state incomplete: affected request "${eventRow.entity_id}" is missing from loaded scenario snapshot. Failing closed.`,
      );
      (err as unknown as { code: string; statusCode: number }).code = 'SAFETY_SNAPSHOT_INCOMPLETE';
      (err as unknown as { code: string; statusCode: number }).statusCode = 500;
      throw err;
    }

    if (
      eventRow.entity_type === 'RESOURCE' &&
      !resources.some((r) => r.id === eventRow.entity_id)
    ) {
      const err = new Error(
        `Safety-critical state incomplete: affected resource "${eventRow.entity_id}" is missing from loaded scenario snapshot. Failing closed.`,
      );
      (err as unknown as { code: string; statusCode: number }).code = 'SAFETY_SNAPSHOT_INCOMPLETE';
      (err as unknown as { code: string; statusCode: number }).statusCode = 500;
      throw err;
    }

    // Dynamically derive geographic metadata from actual coordinates (no hardcoded NCR bounds)
    const allPoints: GeoPoint[] = [
      ...requests.map((r) => ({ lat: r.lat, lng: r.lng })),
      ...resources.map((r) => ({ lat: r.lat, lng: r.lng })),
      ...shelters.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];
    const bounds = computeBoundingBoxFromPoints(allPoints);
    const region = deriveRegionFromCoordinates(allPoints);
    const classification = classifyScenarioProvenance(requests, resources, shelters);

    const scenarioSnapshot: Scenario = {
      id: `operational-snapshot-${eventId}`,
      simulated: classification.simulated,
      provenance: classification.provenance,
      syntheticDataNote: classification.syntheticDataNote,
      metadata: {
        id: `operational-snapshot-${eventId}`,
        name: `Operational Replanning Snapshot (${region})`,
        region,
        createdAt: new Date().toISOString(),
        bounds,
        simulated: classification.simulated,
        provenance: classification.provenance,
        syntheticDataNote: classification.syntheticDataNote,
      },
      requests,
      resources,
      shelters,
      blockedZones: blockedZones.length > 0 ? blockedZones : undefined,
    };

    // Load complete applicable frozen stops using actual coordinates
    const frozenStops = await this.loadCommittedFrozenStops();

    const input: RepairInput = {
      eventId,
      baselineAssignmentId: options?.baselineAssignmentId ?? null,
      scenarioSnapshot,
      frozenStops,
      affectedRequestIds: eventRow.entity_type === 'REQUEST' ? [eventRow.entity_id] : [],
      affectedResourceIds: eventRow.entity_type === 'RESOURCE' ? [eventRow.entity_id] : [],
      expectedVersion: options?.expectedVersion ?? eventRow.entity_version,
    };

    const result = await this.repairSolver.solveRepair(input);

    // Solver-output validation & safe PROPOSED persistence
    if (result.status === 'PROPOSED' && result.proposedPlan) {
      this.validateFrozenStopInvariants(result.proposedPlan, frozenStops);
      await this.persistRepairProposal(result.proposedPlan, scenarioSnapshot.id);
    }

    return result;
  }

  /**
   * Retrieves all frozen stops from committed assignments with actual parsed coordinates.
   * Guarantees complete safety retrieval without arbitrary pagination limits.
   */
  private async loadCommittedFrozenStops(): Promise<FrozenStopReference[]> {
    if (typeof this.repo.listCommittedFrozenStops === 'function') {
      const stops = await this.repo.listCommittedFrozenStops();
      return stops;
    }

    // Fallback: unconstrained traversal across all committed assignments
    const committedAssignments = await this.repo.listAssignments({ status: 'COMMITTED' });
    const frozenStops: FrozenStopReference[] = [];

    for (const ca of committedAssignments) {
      const detail = await this.repo.getAssignmentWithStops(ca.id);
      if (detail && detail.stops) {
        for (const s of detail.stops) {
          if (s.is_frozen) {
            const geo = parsePointWkt(s.location);
            frozenStops.push({
              assignmentId: s.assignment_id,
              resourceId: s.resource_id,
              stopNumber: s.stop_number,
              targetId: s.target_id,
              type: s.type,
              lat: geo.lat,
              lng: geo.lng,
            });
          }
        }
      }
    }

    return frozenStops;
  }

  /**
   * Validates that the solver's proposed plan preserves all frozen stops exactly.
   */
  private validateFrozenStopInvariants(
    plan: SolverPlan,
    frozenStops: ReadonlyArray<FrozenStopReference>,
  ): void {
    for (const fs of frozenStops) {
      const route = plan.routes.find((r) => r.resourceId === fs.resourceId);
      if (!route) {
        const err = new Error(
          `Solver output validation failure: route for resource "${fs.resourceId}" is missing, violating frozen stop invariant for target "${fs.targetId}"`,
        );
        (err as unknown as { code: string; statusCode: number }).code =
          'FROZEN_STOP_INVARIANT_VIOLATED';
        (err as unknown as { code: string; statusCode: number }).statusCode = 500;
        throw err;
      }

      const matchingStop = route.stops.find(
        (s) => s.stopNumber === fs.stopNumber && s.targetId === fs.targetId && s.type === fs.type,
      );

      if (!matchingStop) {
        const err = new Error(
          `Solver output validation failure: frozen stop #${fs.stopNumber} for target "${fs.targetId}" on resource "${fs.resourceId}" was modified or dropped`,
        );
        (err as unknown as { code: string; statusCode: number }).code =
          'FROZEN_STOP_INVARIANT_VIOLATED';
        (err as unknown as { code: string; statusCode: number }).statusCode = 500;
        throw err;
      }
    }
  }

  /**
   * Safely persists the solver's repair proposal with PROPOSED status,
   * guaranteeing no physical or committed assignments are mutated without operator approval.
   */
  private async persistRepairProposal(plan: SolverPlan, scenarioId: string): Promise<string> {
    const proposalId = `prop-repair-${crypto.randomUUID().slice(0, 8)}`;
    const dbStops: DbAssignmentStop[] = [];

    for (const route of plan.routes) {
      for (const stop of route.stops) {
        dbStops.push({
          ...routeStopToDb(stop, proposalId, route.resourceId),
          created_at: new Date(),
        });
      }
    }

    await this.repo.insertAssignmentWithStops(
      {
        id: proposalId,
        scenario_id: scenarioId,
        status: 'PROPOSED',
        metrics: plan.metrics,
        unserved: plan.unserved,
        committed_at: null,
        committed_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      dbStops,
    );

    return proposalId;
  }
}
