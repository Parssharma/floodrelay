import type { RepairInput, RepairResult, FrozenStopReference, Scenario } from '@floodrelay/shared';
import type { PostgisRepository } from '../db/repository.js';

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

    // Load active scenario snapshot from database
    const requests = await this.repo.listRequests({ limit: 500 });
    const resources = await this.repo.listResources();
    const shelters = await this.repo.listShelters();

    const scenarioSnapshot: Scenario = {
      id: 'active-operational-snapshot',
      metadata: {
        id: 'active-operational-snapshot',
        name: 'Live Operational Re-planning Snapshot',
        region: 'National Capital Region',
        createdAt: new Date().toISOString(),
        bounds: {
          minLat: 28.3,
          maxLat: 28.9,
          minLng: 76.8,
          maxLng: 77.5,
        },
      },
      requests,
      resources,
      shelters,
    };

    // Load all frozen stops from committed assignments
    const committedAssignments = await this.repo.listAssignments({
      status: 'COMMITTED',
      limit: 50,
    });
    const frozenStops: FrozenStopReference[] = [];

    for (const ca of committedAssignments) {
      const detail = await this.repo.getAssignmentWithStops(ca.id);
      if (detail && detail.stops) {
        for (const s of detail.stops) {
          if (s.is_frozen) {
            frozenStops.push({
              assignmentId: s.assignment_id,
              resourceId: s.resource_id,
              stopNumber: s.stop_number,
              targetId: s.target_id,
              type: s.type,
              lat: 0,
              lng: 0,
            });
          }
        }
      }
    }

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
    return result;
  }
}
