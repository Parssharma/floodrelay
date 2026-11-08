import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RescueRequest } from '@floodrelay/shared';
import type { AssignmentRecord, ProposeAssignmentInput } from '../lib/api/types';
import { FloodRelayApiClient } from '../lib/api/client';
import { ApiClientError } from '../lib/api/errors';

describe('Phase 3 & 4: Functional Request-to-Assignment Workflow & Decision Support Safety', () => {
  let client: FloodRelayApiClient;

  beforeEach(() => {
    client = new FloodRelayApiClient({ baseUrl: 'http://localhost:3001' });
    vi.restoreAllMocks();
  });

  describe('1. Geographic Coordinate Formatting Invariants', () => {
    function formatCoordinates(lat: number, lng: number): string {
      const latDir = lat >= 0 ? 'N' : 'S';
      const lngDir = lng >= 0 ? 'E' : 'W';
      return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
    }

    it('formats positive latitude and positive longitude as N and E (Delhi basin)', () => {
      const formatted = formatCoordinates(28.6139, 77.209);
      expect(formatted).toBe('28.613900° N, 77.209000° E');
      expect(formatted).not.toContain('W');
    });

    it('formats positive latitude and negative longitude as N and W (Houston basin)', () => {
      const formatted = formatCoordinates(29.7604, -95.3698);
      expect(formatted).toBe('29.760400° N, 95.369800° W');
    });

    it('formats negative latitude and positive longitude as S and E (Southern hemisphere)', () => {
      const formatted = formatCoordinates(-33.8688, 151.2093);
      expect(formatted).toBe('33.868800° S, 151.209300° E');
    });

    it('formats negative latitude and negative longitude as S and W', () => {
      const formatted = formatCoordinates(-23.5505, -46.6333);
      expect(formatted).toBe('23.550500° S, 46.633300° W');
    });
  });

  describe('2. Request Eligibility & Duplicate Validation', () => {
    function evaluateRequestEligibility(req: Partial<RescueRequest>): {
      isEligible: boolean;
      reason: string;
    } {
      const isPending = !req.status || req.status === 'PENDING';
      const isDuplicate = Boolean(req.isFlaggedDuplicate);
      const isEligible = isPending && !isDuplicate;

      let reason = '';
      const statusStr = (req.status as string) || 'PENDING';
      if (statusStr === 'ASSIGNED' || req.status === 'IN_TRANSIT') {
        reason = 'Request is already in transit / assigned to an active route plan.';
      } else if (req.status === 'RESCUED') {
        reason = 'Request has already been served and rescued.';
      } else if (req.status === 'CANCELLED') {
        reason = 'Request was cancelled.';
      } else if (isDuplicate) {
        reason = 'Flagged as potential duplicate. Review duplicate ticket before planning.';
      }

      return { isEligible, reason };
    }

    it('approves a clean PENDING request with no duplicate flag', () => {
      const result = evaluateRequestEligibility({
        id: 'req_001',
        status: 'PENDING',
        isFlaggedDuplicate: false,
      });
      expect(result.isEligible).toBe(true);
      expect(result.reason).toBe('');
    });

    it('rejects an ASSIGNED / IN_TRANSIT request with explicit explanation', () => {
      const result = evaluateRequestEligibility({
        id: 'req_002',
        status: 'IN_TRANSIT',
        isFlaggedDuplicate: false,
      });
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('already in transit');
    });

    it('rejects a RESCUED request with explicit explanation', () => {
      const result = evaluateRequestEligibility({
        id: 'req_003',
        status: 'RESCUED',
        isFlaggedDuplicate: false,
      });
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('already been served and rescued');
    });

    it('rejects a CANCELLED request with explicit explanation', () => {
      const result = evaluateRequestEligibility({
        id: 'req_004',
        status: 'CANCELLED',
        isFlaggedDuplicate: false,
      });
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Request was cancelled');
    });

    it('rejects a duplicate-flagged request even if PENDING', () => {
      const result = evaluateRequestEligibility({
        id: 'req_005',
        status: 'PENDING',
        isFlaggedDuplicate: true,
      });
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Flagged as potential duplicate');
    });
  });

  describe('3. Plan Rescue Assignment & View on Map Navigation URLs', () => {
    function generatePlanRescueUrl(req: RescueRequest): string {
      return `/operator/assignments?requestId=${encodeURIComponent(req.id)}&urgency=${encodeURIComponent(
        req.urgency,
      )}&peopleCount=${req.peopleCount}`;
    }

    function generateViewOnMapUrl(req: RescueRequest): string {
      return `/operator/map?requestId=${encodeURIComponent(req.id)}`;
    }

    it('builds valid assignments planning URL preserving request ID, urgency, and people count', () => {
      const req: RescueRequest = {
        id: 'req-delhi-042',
        lat: 28.65,
        lng: 77.23,
        peopleCount: 6,
        urgency: 'CRITICAL',
        medicalNeeds: true,
        source: 'REPORTED',
        status: 'PENDING',
        createdAt: '2026-11-08T12:00:00.000Z',
      };

      const url = generatePlanRescueUrl(req);
      const parsed = new URL(url, 'http://localhost:3000');
      expect(parsed.pathname).toBe('/operator/assignments');
      expect(parsed.searchParams.get('requestId')).toBe('req-delhi-042');
      expect(parsed.searchParams.get('urgency')).toBe('CRITICAL');
      expect(parsed.searchParams.get('peopleCount')).toBe('6');
    });

    it('builds valid View on Map URL focusing requested incident', () => {
      const req: RescueRequest = {
        id: 'req-delhi-042',
        lat: 28.65,
        lng: 77.23,
        peopleCount: 6,
        urgency: 'CRITICAL',
        medicalNeeds: true,
        source: 'REPORTED',
        status: 'PENDING',
        createdAt: '2026-11-08T12:00:00.000Z',
      };

      const url = generateViewOnMapUrl(req);
      const parsed = new URL(url, 'http://localhost:3000');
      expect(parsed.pathname).toBe('/operator/map');
      expect(parsed.searchParams.get('requestId')).toBe('req-delhi-042');
    });
  });

  describe('4. Solver Proposal Selected Request Inclusion Inspection Logic', () => {
    function inspectRequestInclusion(
      requestId: string,
      plan: AssignmentRecord,
      activeScenarioId: string,
    ): {
      status: 'SERVED' | 'UNSERVED' | 'NOT_IN_SCENARIO';
      resourceId?: string;
      message: string;
    } {
      for (const route of plan.routes || []) {
        if (route.servedRequestIds?.includes(requestId)) {
          return {
            status: 'SERVED',
            resourceId: route.resourceId,
            message: `Request #${requestId} was included in proposed routes for Craft "${route.resourceId}".`,
          };
        }
        const stop = route.stops?.find((s) => s.targetId === requestId && s.type === 'PICKUP');
        if (stop) {
          return {
            status: 'SERVED',
            resourceId: route.resourceId,
            message: `Request #${requestId} was included in proposed routes for Craft "${route.resourceId}" (Stop #${stop.stopNumber}).`,
          };
        }
      }

      const isUnserved = plan.unserved?.some(
        (u) =>
          (typeof u === 'string' && u === requestId) ||
          (typeof u === 'object' && u !== null && 'requestId' in u && u.requestId === requestId),
      );

      if (isUnserved) {
        return {
          status: 'UNSERVED',
          message: `Request #${requestId} could not be served under the current scenario constraints (craft capacity or shift limits).`,
        };
      }

      return {
        status: 'NOT_IN_SCENARIO',
        message: `Request #${requestId} was not included in active scenario "${plan.scenarioId || activeScenarioId}".`,
      };
    }

    const mockPlan: AssignmentRecord = {
      id: 'assign_plan_001',
      scenarioId: 'scenario-delhi-yamuna-demo',
      status: 'PROPOSED',
      metrics: {
        coveragePercent: 80,
        totalTravelTimeMinutes: 45.2,
        totalTravelDistanceKm: 12.4,
        highPriorityWaitTimeMinutes: 10.0,
        solveDurationMs: 22,
        servedRequestsCount: 4,
        unservedRequestsCount: 1,
      },
      unserved: [
        {
          requestId: 'req_unserved_99',
          reason: 'CAPACITY_EXCEEDED',
          details: 'Craft capacity exceeded',
        },
      ],
      routes: [
        {
          resourceId: 'res-boat-alpha',
          stops: [
            {
              stopNumber: 1,
              type: 'DEPOT',
              targetId: 'depot-north',
              lat: 28.7,
              lng: 77.2,
              passengersPickedUp: 0,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 0,
              isFrozen: false,
            },
            {
              stopNumber: 2,
              type: 'PICKUP',
              targetId: 'req_served_01',
              lat: 28.71,
              lng: 77.21,
              passengersPickedUp: 4,
              passengersDroppedOff: 0,
              estimatedArrivalMinutes: 12,
              isFrozen: false,
            },
          ],
          totalTravelDistanceKm: 12.4,
          totalDurationMinutes: 45.2,
          servedRequestIds: ['req_served_01'],
        },
      ],
      createdAt: '2026-11-08T12:00:00.000Z',
      updatedAt: '2026-11-08T12:00:00.000Z',
    };

    it('correctly detects a request that is SERVED by a craft in the proposed plan', () => {
      const result = inspectRequestInclusion(
        'req_served_01',
        mockPlan,
        'scenario-delhi-yamuna-demo',
      );
      expect(result.status).toBe('SERVED');
      expect(result.resourceId).toBe('res-boat-alpha');
      expect(result.message).toContain('Craft "res-boat-alpha"');
    });

    it('correctly detects a request that is UNSERVED due to scenario constraints', () => {
      const result = inspectRequestInclusion(
        'req_unserved_99',
        mockPlan,
        'scenario-delhi-yamuna-demo',
      );
      expect(result.status).toBe('UNSERVED');
      expect(result.message).toContain(
        'could not be served under the current scenario constraints',
      );
    });

    it('correctly classifies a request NOT IN SCENARIO', () => {
      const result = inspectRequestInclusion(
        'req_foreign_999',
        mockPlan,
        'scenario-delhi-yamuna-demo',
      );
      expect(result.status).toBe('NOT_IN_SCENARIO');
      expect(result.message).toContain('not included in active scenario');
    });
  });

  describe('5. Human-Supervised Proposal Generation Contract', () => {
    it('sends real proposeAssignment payload and receives PROPOSED plan', async () => {
      const mockResult: AssignmentRecord = {
        id: 'assign_propose_test_01',
        scenarioId: 'scenario-delhi-yamuna-demo',
        status: 'PROPOSED',
        metrics: {
          coveragePercent: 100,
          totalTravelTimeMinutes: 38.5,
          totalTravelDistanceKm: 10.2,
          highPriorityWaitTimeMinutes: 8.5,
          solveDurationMs: 19,
          servedRequestsCount: 5,
          unservedRequestsCount: 0,
        },
        unserved: [],
        routes: [],
        createdAt: '2026-11-08T12:00:00.000Z',
        updatedAt: '2026-11-08T12:00:00.000Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: mockResult,
        }),
      });

      const input: ProposeAssignmentInput = {
        algorithm: 'cluster-allocation',
        scenarioId: 'scenario-delhi-yamuna-demo',
        maxShiftMinutes: 480,
        preserveFrozen: true,
        includeUnverified: false,
      };

      const plan = await client.proposeAssignment(input);
      expect(plan.id).toBe('assign_propose_test_01');
      expect(plan.status).toBe('PROPOSED');
      // Invariant: Proposals must NOT be automatically COMMITTED
      expect(plan.status).not.toBe('COMMITTED');
    });

    it('handles solver API error responses cleanly with ApiClientError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'INVALID_SCENARIO',
            message: 'Scenario "unknown-basin" not found in PostGIS database.',
          },
        }),
      });

      await expect(
        client.proposeAssignment({
          algorithm: 'cluster-allocation',
          scenarioId: 'unknown-basin',
          maxShiftMinutes: 480,
        }),
      ).rejects.toThrow(ApiClientError);
    });
  });

  describe('6. Explicit Human Commitment & Safety Invariants', () => {
    it('commits assignment only upon explicit operator confirmation call', async () => {
      const mockCommitted: AssignmentRecord = {
        id: 'assign_propose_test_01',
        scenarioId: 'scenario-delhi-yamuna-demo',
        status: 'COMMITTED',
        metrics: {
          coveragePercent: 100,
          totalTravelTimeMinutes: 38.5,
          totalTravelDistanceKm: 10.2,
          highPriorityWaitTimeMinutes: 8.5,
          solveDurationMs: 19,
          servedRequestsCount: 5,
          unservedRequestsCount: 0,
        },
        unserved: [],
        routes: [],
        createdAt: '2026-11-08T12:00:00.000Z',
        updatedAt: '2026-11-08T12:05:00.000Z',
      };

      let sentBody = '';
      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        sentBody = options?.body as string;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: mockCommitted,
          }),
        };
      });

      const updated = await client.commitAssignment('assign_propose_test_01', {
        operatorId: 'eoc_dispatcher_01',
        notes: 'Verified safe draft clearance and shelter capacity.',
      });

      expect(updated.status).toBe('COMMITTED');
      expect(sentBody).toContain('eoc_dispatcher_01');
      expect(sentBody).toContain('Verified safe draft clearance');
    });

    it('handles HTTP 409 Conflict when assignment was already committed or version conflict occurs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'ALREADY_COMMITTED',
            message: 'Assignment plan has already been committed.',
          },
        }),
      });

      try {
        await client.commitAssignment('assign_already_committed', {
          operatorId: 'operator_02',
        });
        expect.unreachable('Should have thrown ApiClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).statusCode).toBe(409);
        expect((err as ApiClientError).code).toBe('ALREADY_COMMITTED');
      }
    });

    it('handles HTTP 403 Forbidden when operator lacks authorization to commit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions. Role DISPATCHER or ADMIN required to commit plans.',
          },
        }),
      });

      try {
        await client.commitAssignment('assign_test_forbidden', {
          operatorId: 'read_only_viewer',
        });
        expect.unreachable('Should have thrown ApiClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).statusCode).toBe(403);
      }
    });
  });

  describe('7. Selected Request Context Verification Logic (Database Retrieval & Validation)', () => {
    function evaluateVerifiedEligibility(req: RescueRequest | null): {
      isEligible: boolean;
      reason: string;
      badgeText: string;
    } {
      if (!req) {
        return {
          isEligible: false,
          reason: 'UNVERIFIED',
          badgeText: 'UNVERIFIED',
        };
      }

      if (req.isFlaggedDuplicate) {
        return {
          isEligible: false,
          reason: 'DUPLICATE',
          badgeText: 'INELIGIBLE: DUPLICATE',
        };
      }

      if (req.status === 'ASSIGNED') {
        return {
          isEligible: false,
          reason: 'ASSIGNED',
          badgeText: 'INELIGIBLE: ALREADY ASSIGNED',
        };
      }

      if (req.status === 'IN_TRANSIT') {
        return {
          isEligible: false,
          reason: 'IN_TRANSIT',
          badgeText: 'INELIGIBLE: IN TRANSIT',
        };
      }

      if (req.status === 'RESCUED') {
        return {
          isEligible: false,
          reason: 'RESCUED',
          badgeText: 'INELIGIBLE: RESCUED',
        };
      }

      if (req.status === 'CANCELLED') {
        return {
          isEligible: false,
          reason: 'CANCELLED',
          badgeText: 'INELIGIBLE: CANCELLED',
        };
      }

      if (req.status === 'PENDING') {
        return {
          isEligible: true,
          reason: 'PENDING_ELIGIBLE',
          badgeText: 'VERIFIED • ELIGIBLE FOR PLANNING',
        };
      }

      return {
        isEligible: false,
        reason: 'UNKNOWN',
        badgeText: `INELIGIBLE: ${req.status}`,
      };
    }

    it('retrieves and validates request from API, enforcing verified urgency and passenger count', async () => {
      const mockDbRecord: RescueRequest = {
        id: 'req-verified-01',
        lat: 28.65,
        lng: 77.23,
        peopleCount: 8,
        urgency: 'CRITICAL',
        source: 'REPORTED',
        status: 'PENDING',
        isFlaggedDuplicate: false,
        createdAt: '2026-11-08T10:00:00.000Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: mockDbRecord,
        }),
      });

      const retrieved = await client.getRequest('req-verified-01');
      expect(retrieved.id).toBe('req-verified-01');
      expect(retrieved.urgency).toBe('CRITICAL');
      expect(retrieved.peopleCount).toBe(8);

      const evalResult = evaluateVerifiedEligibility(retrieved);
      expect(evalResult.isEligible).toBe(true);
      expect(evalResult.badgeText).toContain('ELIGIBLE FOR PLANNING');
    });

    it('handles missing or deleted requests (HTTP 404) safely', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Request not found in database',
          },
        }),
      });

      await expect(client.getRequest('req-nonexistent')).rejects.toThrow(ApiClientError);
      const evalResult = evaluateVerifiedEligibility(null);
      expect(evalResult.isEligible).toBe(false);
      expect(evalResult.reason).toBe('UNVERIFIED');
    });

    it('identifies stale requests already RESCUED or IN_TRANSIT and marks them ineligible', () => {
      const rescuedReq: RescueRequest = {
        id: 'req-stale-01',
        lat: 28.65,
        lng: 77.23,
        peopleCount: 2,
        urgency: 'HIGH',
        source: 'REPORTED',
        status: 'RESCUED',
        createdAt: '2026-11-08T10:00:00.000Z',
      };

      const result = evaluateVerifiedEligibility(rescuedReq);
      expect(result.isEligible).toBe(false);
      expect(result.badgeText).toBe('INELIGIBLE: RESCUED');
      expect(result.reason).toBe('RESCUED');
    });

    it('identifies duplicate requests and marks them ineligible for solver re-planning', () => {
      const duplicateReq: RescueRequest = {
        id: 'req-dup-02',
        lat: 28.65,
        lng: 77.23,
        peopleCount: 4,
        urgency: 'CRITICAL',
        source: 'REPORTED',
        status: 'PENDING',
        isFlaggedDuplicate: true,
        duplicateOfId: 'req-parent-01',
        createdAt: '2026-11-08T10:00:00.000Z',
      };

      const result = evaluateVerifiedEligibility(duplicateReq);
      expect(result.isEligible).toBe(false);
      expect(result.badgeText).toBe('INELIGIBLE: DUPLICATE');
      expect(result.reason).toBe('DUPLICATE');
    });
  });
});
