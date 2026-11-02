import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateOperationalEvent,
  type OperationalEvent,
  type SolverPlan,
  type RepairResult,
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
  });

  describe('RepairOrchestrationService Boundary', () => {
    let mockRepo: Partial<PostgisRepository>;

    beforeEach(() => {
      mockRepo = {
        getOperationalEvent: vi.fn().mockResolvedValue({
          id: 'evt-100',
          event_type: 'REQUEST_CREATED',
          entity_type: 'REQUEST',
          entity_id: 'req-100',
          entity_version: 1,
        } as DbOperationalEvent),
        listRequests: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([]),
        listShelters: vi.fn().mockResolvedValue([]),
        listAssignments: vi.fn().mockResolvedValue([]),
      };
    });

    it('throws explicit 503 REPAIR_ENGINE_UNAVAILABLE when called without an injected solver in Part 1', async () => {
      const orchestrator = new RepairOrchestrationService(mockRepo as PostgisRepository);

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

    it('delegates to injected solver when a solver implementation is plugged in', async () => {
      const mockSolver: RepairSolver = {
        solveRepair: vi.fn().mockResolvedValue({
          status: 'PROPOSED',
          unservedRequestIds: [],
          warnings: [],
          proposedPlan: {
            scenarioId: 'active-operational-snapshot',
            calculatedAt: new Date().toISOString(),
            routes: [],
            unserved: [],
            metrics: {
              coveragePercent: 100,
              totalTravelTimeMinutes: 15,
              totalTravelDistanceKm: 8,
              highPriorityWaitTimeMinutes: 5,
              solveDurationMs: 42,
              servedRequestsCount: 1,
              unservedRequestsCount: 0,
            },
          } as SolverPlan,
        } as RepairResult),
      };

      const orchestrator = new RepairOrchestrationService(
        mockRepo as PostgisRepository,
        mockSolver,
      );

      const result = await orchestrator.orchestrateRepair('evt-100');
      expect(result.status).toBe('PROPOSED');
      expect(mockSolver.solveRepair).toHaveBeenCalledTimes(1);
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
