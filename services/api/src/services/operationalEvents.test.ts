import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateOperationalEvent,
  type OperationalEvent,
  type SolverPlan,
  type SolverMetrics,
  type RepairResult,
  type RepairInput,
} from '@floodrelay/shared';
import { OperationalEventService } from './operationalEventService.js';
import { AffectedScopeService } from './affectedScopeService.js';
import { RepairOrchestrationService, type RepairSolver } from './repairOrchestrationService.js';
import { hasPermission } from '../middleware/rbacMiddleware.js';
import type { PostgisRepository } from '../db/repository.js';
import type { DbOperationalEvent } from '../db/schema.js';

describe('Phase 5 Part 1: Operational Events & Replanning Infrastructure', () => {
  describe('OperationalEvent Contract & Validation', () => {
    it('validates a well-formed operational event', () => {
      const validEvent: OperationalEvent = {
        id: 'evt-001',
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: 'req-123',
        actorId: null,
        actorType: 'CITIZEN',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        processingStatus: 'RECORDED',
        processingAttempts: 0,
        payload: { peopleCount: 3, urgency: 'HIGH' },
      };

      const result = validateOperationalEvent(validEvent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects an invalid event type', () => {
      const invalidEvent = {
        id: 'evt-002',
        type: 'INVALID_EVENT_TYPE',
        entityType: 'REQUEST',
        entityId: 'req-123',
        actorType: 'CITIZEN',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: {},
      };

      const result = validateOperationalEvent(invalidEvent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid operational event type'))).toBe(true);
    });

    it('rejects an invalid entity type', () => {
      const invalidEvent = {
        id: 'evt-003',
        type: 'REQUEST_CREATED',
        entityType: 'UNKNOWN_ENTITY',
        entityId: 'req-123',
        actorType: 'CITIZEN',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: {},
      };

      const result = validateOperationalEvent(invalidEvent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid event entity type'))).toBe(true);
    });

    it('rejects an invalid actor type', () => {
      const invalidEvent = {
        id: 'evt-004',
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: 'req-123',
        actorType: 'HACKER',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: {},
      };

      const result = validateOperationalEvent(invalidEvent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid event actor type'))).toBe(true);
    });
  });

  describe('OperationalEventService', () => {
    let mockRepo: Partial<PostgisRepository>;
    let service: OperationalEventService;

    beforeEach(() => {
      mockRepo = {
        getOperationalEventByIdempotencyKey: vi.fn().mockResolvedValue(null),
        insertOperationalEvent: vi.fn().mockImplementation((evt) =>
          Promise.resolve({
            id: evt.id,
            event_type: evt.type,
            entity_type: evt.entityType,
            entity_id: evt.entityId,
            actor_id: evt.actorId,
            actor_type: evt.actorType,
            payload: evt.payload,
            correlation_id: evt.correlationId ?? null,
            idempotency_key: evt.idempotencyKey ?? null,
            entity_version: evt.entityVersion ?? 1,
            processing_status: 'RECORDED',
            processing_attempts: 0,
            last_error_code: null,
            occurred_at: new Date(evt.occurredAt),
            created_at: new Date(),
            processed_at: null,
          } as DbOperationalEvent),
        ),
        getOperationalEvent: vi.fn(),
        updateOperationalEventStatus: vi.fn().mockResolvedValue(true),
        listAssignments: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([]),
        listRequests: vi.fn().mockResolvedValue([]),
      };

      service = new OperationalEventService(mockRepo as PostgisRepository);
    });

    it('records a new operational event successfully', async () => {
      const result = await service.recordEvent({
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: 'req-456',
        actorType: 'CITIZEN',
        payload: { peopleCount: 2 },
      });

      expect(result.idempotent).toBe(false);
      expect(result.event.type).toBe('REQUEST_CREATED');
      expect(result.event.entityId).toBe('req-456');
      expect(mockRepo.insertOperationalEvent).toHaveBeenCalledTimes(1);
    });

    it('returns existing event on idempotent replay without inserting a duplicate', async () => {
      const existingDbRow: DbOperationalEvent = {
        id: 'evt-existing',
        event_type: 'REQUEST_CREATED',
        entity_type: 'REQUEST',
        entity_id: 'req-456',
        actor_id: null,
        actor_type: 'CITIZEN',
        payload: { peopleCount: 2 },
        correlation_id: null,
        idempotency_key: 'idemp-key-1',
        entity_version: 1,
        processing_status: 'RECORDED',
        processing_attempts: 0,
        last_error_code: null,
        occurred_at: new Date(),
        created_at: new Date(),
        processed_at: null,
      };

      mockRepo.getOperationalEventByIdempotencyKey = vi.fn().mockResolvedValue(existingDbRow);

      const result = await service.recordEvent({
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: 'req-456',
        actorType: 'CITIZEN',
        idempotencyKey: 'idemp-key-1',
        payload: { peopleCount: 2 },
      });

      expect(result.idempotent).toBe(true);
      expect(result.event.id).toBe('evt-existing');
      expect(mockRepo.insertOperationalEvent).not.toHaveBeenCalled();
    });
  });

  describe('AffectedScopeService', () => {
    let mockRepo: Partial<PostgisRepository>;
    let scopeService: AffectedScopeService;

    beforeEach(() => {
      mockRepo = {
        listAssignments: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([{ id: 'res-boat-1', status: 'AVAILABLE' }]),
        listRequests: vi.fn().mockResolvedValue([]),
        getAssignmentWithStops: vi.fn().mockResolvedValue(null),
      };
      scopeService = new AffectedScopeService(mockRepo as PostgisRepository);
    });

    it('identifies candidate resources and repair eligibility for REQUEST_CREATED', async () => {
      const event: OperationalEvent = {
        id: 'evt-1',
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: 'req-999',
        actorId: null,
        actorType: 'CITIZEN',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: { peopleCount: 4 },
      };

      const scope = await scopeService.computeAffectedScope(event);
      expect(scope.affectedRequestIds).toContain('req-999');
      expect(scope.affectedResourceIds).toContain('res-boat-1');
      expect(scope.repairEligible).toBe(true);
      expect(scope.committedAssignmentsRequiringReview).toHaveLength(0);
    });

    it('identifies affected resources and requests for RESOURCE_OFFLINE', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([
        { id: 'assign-p1', status: 'PROPOSED' },
        { id: 'assign-c1', status: 'COMMITTED' },
      ]);

      mockRepo.getAssignmentWithStops = vi.fn().mockImplementation((id: string) => {
        if (id === 'assign-p1') {
          return Promise.resolve({
            assignment: { id: 'assign-p1', status: 'PROPOSED' },
            stops: [
              {
                id: 's1',
                assignment_id: 'assign-p1',
                resource_id: 'res-truck-1',
                stop_number: 1,
                type: 'PICKUP',
                target_id: 'req-101',
                is_frozen: false,
              },
            ],
          });
        }
        if (id === 'assign-c1') {
          return Promise.resolve({
            assignment: { id: 'assign-c1', status: 'COMMITTED' },
            stops: [
              {
                id: 's2',
                assignment_id: 'assign-c1',
                resource_id: 'res-truck-1',
                stop_number: 1,
                type: 'PICKUP',
                target_id: 'req-102',
                is_frozen: true,
              },
            ],
          });
        }
        return Promise.resolve(null);
      });

      const event: OperationalEvent = {
        id: 'evt-2',
        type: 'RESOURCE_OFFLINE',
        entityType: 'RESOURCE',
        entityId: 'res-truck-1',
        actorId: 'operator-1',
        actorType: 'OPERATOR',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: { reason: 'Engine breakdown' },
      };

      const scope = await scopeService.computeAffectedScope(event);
      expect(scope.affectedResourceIds).toContain('res-truck-1');
      expect(scope.affectedRequestIds).toContain('req-101');
      expect(scope.affectedProposedAssignmentIds).toContain('assign-p1');
      // Committed assignment is flagged for operator review but NOT mutated!
      expect(scope.committedAssignmentsRequiringReview).toContain('assign-c1');
    });

    it('evaluates affected scope without truncation when >50 proposed and >50 committed assignments exist', async () => {
      // 65 proposed and 60 committed assignments
      const sixtyFiveProposed = Array.from({ length: 65 }, (_, i) => ({
        id: `prop-batch-${i}`,
        status: 'PROPOSED',
      }));
      const sixtyCommitted = Array.from({ length: 60 }, (_, i) => ({
        id: `comm-batch-${i}`,
        status: 'COMMITTED',
      }));

      mockRepo.listAssignments = vi.fn().mockImplementation((filter?: { status?: string }) => {
        if (filter?.status === 'PROPOSED') return Promise.resolve(sixtyFiveProposed);
        if (filter?.status === 'COMMITTED') return Promise.resolve(sixtyCommitted);
        return Promise.resolve([]);
      });

      const event: OperationalEvent = {
        id: 'evt-road-hazard',
        type: 'ROAD_BLOCKED',
        entityType: 'ROAD_ZONE',
        entityId: 'zone-flood-basin',
        actorId: 'dispatcher-1',
        actorType: 'OPERATOR',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        payload: { severity: 'BLOCKED' },
      };

      const scope = await scopeService.computeAffectedScope(event);
      // All 65 proposed assignments identified without 50-limit truncation
      expect(scope.affectedProposedAssignmentIds).toHaveLength(65);
      // All 60 committed assignments identified for review without 50-limit truncation
      expect(scope.committedAssignmentsRequiringReview).toHaveLength(60);
    });
  });

  describe('RepairOrchestrationService Boundary', () => {
    let mockRepo: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
      mockRepo = {
        getOperationalEvent: vi.fn().mockResolvedValue({
          id: 'evt-100',
          event_type: 'REQUEST_CREATED',
          entity_type: 'REQUEST',
          entity_id: 'req-100',
          entity_version: 1,
        } as DbOperationalEvent),
        listRequests: vi.fn().mockResolvedValue([
          {
            id: 'req-100',
            lat: 28.65,
            lng: 77.22,
            peopleCount: 2,
            urgency: 'HIGH',
            createdAt: new Date().toISOString(),
            source: 'REPORTED',
          },
        ]),
        listResources: vi.fn().mockResolvedValue([
          {
            id: 'res-1',
            name: 'Boat 1',
            type: 'BOAT',
            capacity: 6,
            speedKmH: 25,
            lat: 28.64,
            lng: 77.21,
            status: 'AVAILABLE',
          },
        ]),
        listShelters: vi.fn().mockResolvedValue([
          {
            id: 'sh-1',
            name: 'Shelter 1',
            lat: 28.66,
            lng: 77.23,
            capacity: 100,
          },
        ]),
        listBlockedZones: vi.fn().mockResolvedValue([]),
        listAssignments: vi.fn().mockResolvedValue([]),
        insertAssignmentWithStops: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('throws explicit 503 REPAIR_ENGINE_UNAVAILABLE when called without an injected solver in Part 1', async () => {
      const orchestrator = new RepairOrchestrationService(mockRepo as unknown as PostgisRepository);

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toThrow(
        /Incremental repair engine is not available/,
      );

      try {
        await orchestrator.orchestrateRepair('evt-100');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('REPAIR_ENGINE_UNAVAILABLE');
        expect((err as { statusCode: number }).statusCode).toBe(503);
      }
    });

    it('delegates to injected solver and safely persists proposal with PROPOSED status', async () => {
      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'operational-snapshot-evt-100',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [],
                totalTravelDistanceKm: 5,
                totalDurationMinutes: 12,
                servedRequestIds: ['req-100'],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 12,
              totalTravelDistanceKm: 5,
              highPriorityWaitTimeMinutes: 4,
              solveDurationMs: 30,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            },
          } as SolverPlan,
        } as RepairResult),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      const result = await orchestrator.orchestrateRepair('evt-100');
      expect(result.status).toBe('PROPOSED');
      expect(mockSolver.solveRepair).toHaveBeenCalledTimes(1);

      // Verify safe PROPOSED persistence: never COMMITTED
      expect(mockRepo.insertAssignmentWithStops).toHaveBeenCalledTimes(1);
      const insertedAssignment = mockRepo.insertAssignmentWithStops!.mock.calls[0]?.[0];
      expect(insertedAssignment.status).toBe('PROPOSED');
    });

    it('populates frozenStops with actual nonzero coordinates from assignment stops', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-committed-1' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-committed-1', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-committed-1',
            resource_id: 'res-1',
            stop_number: 1,
            target_id: 'req-prev',
            type: 'PICKUP',
            location: 'POINT(77.2456 28.6123)', // WKT: lng lat
            is_frozen: true,
          },
        ],
      });

      let capturedInput: RepairInput | null = null;
      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockImplementation((input: RepairInput) => {
          capturedInput = input;
          return Promise.resolve({
            status: 'PROPOSED',
            unservedRequestIds: [],
            warnings: [],
            proposedPlan: {
              scenarioId: input.scenarioSnapshot.id,
              calculatedAt: new Date().toISOString(),
              routes: [
                {
                  resourceId: 'res-1',
                  stops: [
                    {
                      stopNumber: 1,
                      type: 'PICKUP',
                      targetId: 'req-prev',
                      lat: 28.6123,
                      lng: 77.2456,
                      passengersPickedUp: 2,
                      passengersDroppedOff: 0,
                      estimatedArrivalMinutes: 5,
                      isFrozen: true,
                    },
                  ],
                  totalTravelDistanceKm: 4,
                  totalDurationMinutes: 10,
                  servedRequestIds: ['req-prev'],
                },
              ],
              unserved: [],
              metrics: {
                coveragePercent: 100,
                totalTravelTimeMinutes: 10,
                totalTravelDistanceKm: 4,
                highPriorityWaitTimeMinutes: 2,
                solveDurationMs: 15,
                servedRequestsCount: 1,
                unservedRequestsCount: 0,
              } satisfies SolverMetrics,
            },
          });
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      await orchestrator.orchestrateRepair('evt-100');
      expect(capturedInput).not.toBeNull();
      const frozen = capturedInput!.frozenStops;
      expect(frozen).toHaveLength(1);
      // Realistic nonzero coordinates: longitude and latitude parsed correctly
      expect(frozen[0]?.lat).toBeCloseTo(28.6123, 4);
      expect(frozen[0]?.lng).toBeCloseTo(77.2456, 4);
      expect(frozen[0]?.lat).not.toBe(0);
      expect(frozen[0]?.lng).not.toBe(0);
    });

    it('loads complete safety snapshot without truncation when >500 requests and >50 assignments exist', async () => {
      // Generate 520 requests
      const manyRequests = Array.from({ length: 520 }, (_, i) => ({
        id: i === 0 ? 'req-100' : `req-overflow-${i}`,
        lat: 28.6 + (i % 50) * 0.002,
        lng: 77.2 + (i % 50) * 0.002,
        peopleCount: 2,
        urgency: 'MEDIUM' as const,
        createdAt: new Date().toISOString(),
        source: 'REPORTED' as const,
      }));
      mockRepo.listRequests = vi.fn().mockResolvedValue(manyRequests);

      // Generate 60 committed assignments
      const manyCommitted = Array.from({ length: 60 }, (_, i) => ({
        id: `ca-${i}`,
        status: 'COMMITTED',
      }));
      mockRepo.listAssignments = vi.fn().mockResolvedValue(manyCommitted);
      mockRepo.getAssignmentWithStops = vi.fn().mockImplementation((id: string) =>
        Promise.resolve({
          assignment: { id, status: 'COMMITTED' },
          stops: [
            {
              assignment_id: id,
              resource_id: 'res-1',
              stop_number: 1,
              target_id: `target-${id}`,
              type: 'PICKUP',
              location: 'POINT(77.21 28.63)',
              is_frozen: true,
            },
          ],
        }),
      );

      let capturedInput: RepairInput | null = null;
      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockImplementation((input: RepairInput) => {
          capturedInput = input;
          return Promise.resolve({
            status: 'NO_FEASIBLE_REPAIR',
            unservedRequestIds: [],
            warnings: ['Capacity exceeded'],
          });
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      await orchestrator.orchestrateRepair('evt-100');
      expect(capturedInput).not.toBeNull();
      // Complete snapshot of all 520 requests preserved
      expect(capturedInput!.scenarioSnapshot.requests).toHaveLength(520);
      // Complete safety-critical frozen stop set of all 60 assignments retrieved
      expect(capturedInput!.frozenStops).toHaveLength(60);
    });

    it('rejects version conflict when expectedVersion does not match entity version with 409', async () => {
      const mockSolver: RepairSolver = {
        solveRepair: vi.fn(),
      };
      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      // eventRow has entity_version: 1; caller expects 2
      await expect(
        orchestrator.orchestrateRepair('evt-100', { expectedVersion: 2 }),
      ).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
      expect(mockSolver.solveRepair).not.toHaveBeenCalled();
    });

    it('fails closed with 500 SAFETY_SNAPSHOT_INCOMPLETE when affected request is missing from snapshot', async () => {
      // listRequests returns list that does NOT contain req-100
      mockRepo.listRequests = vi.fn().mockResolvedValue([
        {
          id: 'req-other',
          lat: 28.6,
          lng: 77.2,
          peopleCount: 1,
          urgency: 'LOW',
          createdAt: new Date().toISOString(),
          source: 'REPORTED',
        },
      ]);

      const mockSolver: RepairSolver = { solveRepair: vi.fn() };
      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'SAFETY_SNAPSHOT_INCOMPLETE',
        statusCode: 500,
      });
      expect(mockSolver.solveRepair).not.toHaveBeenCalled();
    });

    it('fails closed when solver output modifies or drops a frozen stop', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-1' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-1', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-1',
            resource_id: 'res-1',
            stop_number: 1,
            target_id: 'req-frozen-required',
            type: 'PICKUP',
            location: 'POINT(77.2 28.6)',
            is_frozen: true,
          },
        ],
      });

      // Solver attempts to omit the frozen stop
      const maliciousSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [], // Dropped the frozen stop!
                totalTravelDistanceKm: 0,
                totalDurationMinutes: 0,
                servedRequestIds: [],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 0,
              totalTravelTimeMinutes: 0,
              totalTravelDistanceKm: 0,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 5,
              servedRequestsCount: 0,
              unservedRequestsCount: 1,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        maliciousSolver,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'FROZEN_STOP_INVARIANT_VIOLATED',
        statusCode: 500,
      });
      expect(mockRepo.insertAssignmentWithStops).not.toHaveBeenCalled();
    });

    it('fails closed when only latitude of a frozen stop changes', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-c1' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-c1', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-c1',
            resource_id: 'res-1',
            stop_number: 1,
            target_id: 'req-prev',
            type: 'PICKUP',
            location: 'POINT(77.2456 28.6123)',
            is_frozen: true,
          },
        ],
      });

      const solverMutatingLat: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [
                  {
                    stopNumber: 1,
                    type: 'PICKUP',
                    targetId: 'req-prev',
                    lat: 28.625, // Changed latitude!
                    lng: 77.2456,
                    passengersPickedUp: 1,
                    passengersDroppedOff: 0,
                    estimatedArrivalMinutes: 5,
                    isFrozen: true,
                  },
                ],
                totalTravelDistanceKm: 1,
                totalDurationMinutes: 5,
                servedRequestIds: ['req-prev'],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 5,
              totalTravelDistanceKm: 1,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        solverMutatingLat,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'FROZEN_STOP_INVARIANT_VIOLATED',
        statusCode: 500,
      });
    });

    it('fails closed when only longitude of a frozen stop changes', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-c1' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-c1', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-c1',
            resource_id: 'res-1',
            stop_number: 1,
            target_id: 'req-prev',
            type: 'PICKUP',
            location: 'POINT(77.2456 28.6123)',
            is_frozen: true,
          },
        ],
      });

      const solverMutatingLng: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [
                  {
                    stopNumber: 1,
                    type: 'PICKUP',
                    targetId: 'req-prev',
                    lat: 28.6123,
                    lng: 77.2589, // Changed longitude!
                    passengersPickedUp: 1,
                    passengersDroppedOff: 0,
                    estimatedArrivalMinutes: 5,
                    isFrozen: true,
                  },
                ],
                totalTravelDistanceKm: 1,
                totalDurationMinutes: 5,
                servedRequestIds: ['req-prev'],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 5,
              totalTravelDistanceKm: 1,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        solverMutatingLng,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'FROZEN_STOP_INVARIANT_VIOLATED',
        statusCode: 500,
      });
    });

    it('fails closed when a frozen stop is duplicated on a route', async () => {
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-c1' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-c1', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-c1',
            resource_id: 'res-1',
            stop_number: 1,
            target_id: 'req-prev',
            type: 'PICKUP',
            location: 'POINT(77.2456 28.6123)',
            is_frozen: true,
          },
        ],
      });

      const solverDuplicatingStop: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [
                  {
                    stopNumber: 1,
                    type: 'PICKUP',
                    targetId: 'req-prev',
                    lat: 28.6123,
                    lng: 77.2456,
                    passengersPickedUp: 1,
                    passengersDroppedOff: 0,
                    estimatedArrivalMinutes: 5,
                    isFrozen: true,
                  },
                  {
                    stopNumber: 2,
                    type: 'PICKUP',
                    targetId: 'req-prev', // Duplicated!
                    lat: 28.6123,
                    lng: 77.2456,
                    passengersPickedUp: 1,
                    passengersDroppedOff: 0,
                    estimatedArrivalMinutes: 8,
                    isFrozen: true,
                  },
                ],
                totalTravelDistanceKm: 2,
                totalDurationMinutes: 8,
                servedRequestIds: ['req-prev'],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 8,
              totalTravelDistanceKm: 2,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        solverDuplicatingStop,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'FROZEN_STOP_INVARIANT_VIOLATED',
        statusCode: 500,
      });
    });

    it('does not falsely require unrelated historical committed assignments from other resources', async () => {
      // res-unrelated was from yesterday, not part of today's scenario
      mockRepo.listAssignments = vi.fn().mockResolvedValue([{ id: 'assign-old' }]);
      mockRepo.getAssignmentWithStops = vi.fn().mockResolvedValue({
        assignment: { id: 'assign-old', status: 'COMMITTED' },
        stops: [
          {
            assignment_id: 'assign-old',
            resource_id: 'res-unrelated-historical',
            stop_number: 1,
            target_id: 'req-old',
            type: 'PICKUP',
            location: 'POINT(77.10 28.50)',
            is_frozen: true,
          },
        ],
      });

      const validSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1',
                stops: [],
                totalTravelDistanceKm: 0,
                totalDurationMinutes: 0,
                servedRequestIds: [],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 0,
              totalTravelTimeMinutes: 0,
              totalTravelDistanceKm: 0,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 0,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        validSolver,
      );

      // Should succeed because res-unrelated-historical is not in scenario snapshot
      const res = await orchestrator.orchestrateRepair('evt-100');
      expect(res.status).toBe('PROPOSED');
    });

    it('rejects with 409 VERSION_CONFLICT when operational event is modified during solving (TOCTOU guard)', async () => {
      let callCount = 0;
      mockRepo.getOperationalEvent = vi.fn().mockImplementation(() => {
        callCount++;
        // First call: version 1. Second call (during persistence revalidation): version 2!
        return Promise.resolve({
          id: 'evt-100',
          event_type: 'REQUEST_CREATED',
          entity_type: 'REQUEST',
          entity_id: 'req-100',
          entity_version: callCount === 1 ? 1 : 2,
        });
      });

      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [],
            unserved: [],
            metrics: {
              coveragePercent: 0,
              totalTravelTimeMinutes: 0,
              totalTravelDistanceKm: 0,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 0,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
      expect(mockRepo.insertAssignmentWithStops).not.toHaveBeenCalled();
    });

    it('rejects with 409 VERSION_CONFLICT when another assignment is committed while repair is solving', async () => {
      let committedQueryCount = 0;
      mockRepo.getLatestCommittedAssignment = vi.fn().mockImplementation(() => {
        committedQueryCount++;
        if (committedQueryCount === 1) {
          return Promise.resolve(null); // Initially no committed assignment
        }
        // During recheck: a new assignment was committed by an operator!
        return Promise.resolve({
          assignment: { id: 'assign-concurrent-committed' },
        });
      });

      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [],
            unserved: [],
            metrics: {
              coveragePercent: 0,
              totalTravelTimeMinutes: 0,
              totalTravelDistanceKm: 0,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 0,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        mockSolver,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
      expect(mockRepo.insertAssignmentWithStops).not.toHaveBeenCalled();
    });

    it('rejects solver output with 500 SOLVER_OUTPUT_INVALID when capacity is violated', async () => {
      const solverViolatingCapacity: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'test',
            calculatedAt: new Date().toISOString(),
            routes: [
              {
                resourceId: 'res-1', // capacity is 6
                stops: [
                  {
                    stopNumber: 1,
                    type: 'PICKUP',
                    targetId: 'req-heavy',
                    lat: 28.64,
                    lng: 77.21,
                    passengersPickedUp: 10, // Exceeds 6!
                    passengersDroppedOff: 0,
                    estimatedArrivalMinutes: 5,
                    isFrozen: false,
                  },
                ],
                totalTravelDistanceKm: 2,
                totalDurationMinutes: 5,
                servedRequestIds: ['req-heavy'],
              },
            ],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 5,
              totalTravelDistanceKm: 2,
              highPriorityWaitTimeMinutes: 0,
              solveDurationMs: 1,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            } satisfies SolverMetrics,
          },
        }),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as unknown as PostgisRepository,
        solverViolatingCapacity,
      );

      await expect(orchestrator.orchestrateRepair('evt-100')).rejects.toMatchObject({
        code: 'SOLVER_OUTPUT_INVALID',
        statusCode: 500,
      });
      expect(mockRepo.insertAssignmentWithStops).not.toHaveBeenCalled();
    });
  });

  describe('Role-Based Access Control (RBAC) Matrix', () => {
    it('enforces exact permission boundaries across all 3 roles', () => {
      // OPERATOR: View events and audit only
      expect(hasPermission('OPERATOR', 'VIEW_EVENTS')).toBe(true);
      expect(hasPermission('OPERATOR', 'VIEW_AUDIT')).toBe(true);
      expect(hasPermission('OPERATOR', 'MANAGE_RESOURCE_STATUS')).toBe(false);
      expect(hasPermission('OPERATOR', 'MANAGE_BLOCKED_ZONES')).toBe(false);
      expect(hasPermission('OPERATOR', 'REQUEST_REPAIR')).toBe(false);
      expect(hasPermission('OPERATOR', 'COMMIT_ASSIGNMENT')).toBe(false);
      expect(hasPermission('OPERATOR', 'MANAGE_OPERATORS')).toBe(false);

      // DISPATCHER: Operational control & planning, but not operator admin
      expect(hasPermission('DISPATCHER', 'VIEW_EVENTS')).toBe(true);
      expect(hasPermission('DISPATCHER', 'VIEW_AUDIT')).toBe(true);
      expect(hasPermission('DISPATCHER', 'MANAGE_RESOURCE_STATUS')).toBe(true);
      expect(hasPermission('DISPATCHER', 'MANAGE_BLOCKED_ZONES')).toBe(true);
      expect(hasPermission('DISPATCHER', 'REQUEST_REPAIR')).toBe(true);
      expect(hasPermission('DISPATCHER', 'COMMIT_ASSIGNMENT')).toBe(true);
      expect(hasPermission('DISPATCHER', 'MANAGE_OPERATORS')).toBe(false);

      // ADMIN: Full system access
      expect(hasPermission('ADMIN', 'VIEW_EVENTS')).toBe(true);
      expect(hasPermission('ADMIN', 'VIEW_AUDIT')).toBe(true);
      expect(hasPermission('ADMIN', 'MANAGE_RESOURCE_STATUS')).toBe(true);
      expect(hasPermission('ADMIN', 'MANAGE_BLOCKED_ZONES')).toBe(true);
      expect(hasPermission('ADMIN', 'REQUEST_REPAIR')).toBe(true);
      expect(hasPermission('ADMIN', 'COMMIT_ASSIGNMENT')).toBe(true);
      expect(hasPermission('ADMIN', 'MANAGE_OPERATORS')).toBe(true);
    });
  });
});
