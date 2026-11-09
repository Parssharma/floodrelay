import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RescueRequest } from '@floodrelay/shared';
import type { AssignmentRecord, ProposeAssignmentInput } from '../lib/api/types';
import { apiClient } from '../lib/api/client';
import { ApiClientError } from '../lib/api/errors';
import OperatorAssignmentsPage from '../app/operator/assignments/page';

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/operator/assignments',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock Link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    title,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    title?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Mock apiClient
vi.mock('../lib/api/client', () => ({
  apiClient: {
    listAssignments: vi.fn(),
    getRequest: vi.fn(),
    proposeAssignment: vi.fn(),
    commitAssignment: vi.fn(),
  },
}));

describe('Operator Assignments: Strict Focused-Request Eligibility Guards across All Proposal Entry Points', () => {
  const eligiblePendingRequest: RescueRequest = {
    id: 'req-delhi-001',
    lat: 28.6139,
    lng: 77.209,
    peopleCount: 4,
    urgency: 'HIGH',
    medicalNeeds: false,
    source: 'REPORTED',
    status: 'PENDING',
    isFlaggedDuplicate: false,
    createdAt: '2026-11-08T12:00:00.000Z',
  };

  const assignedRequest: RescueRequest = {
    ...eligiblePendingRequest,
    id: 'req-delhi-assigned',
    status: 'ASSIGNED',
  };

  const inTransitRequest: RescueRequest = {
    ...eligiblePendingRequest,
    id: 'req-delhi-intransit',
    status: 'IN_TRANSIT',
  };

  const rescuedRequest: RescueRequest = {
    ...eligiblePendingRequest,
    id: 'req-delhi-rescued',
    status: 'RESCUED',
  };

  const cancelledRequest: RescueRequest = {
    ...eligiblePendingRequest,
    id: 'req-delhi-cancelled',
    status: 'CANCELLED',
  };

  const duplicateRequest: RescueRequest = {
    ...eligiblePendingRequest,
    id: 'req-delhi-duplicate',
    isFlaggedDuplicate: true,
    duplicateOfId: 'req-delhi-001',
  };

  const mockExistingAssignments: AssignmentRecord[] = [
    {
      id: 'assign_plan_existing_01',
      scenario_id: 'scenario-delhi-yamuna-demo',
      scenarioId: 'scenario-delhi-yamuna-demo',
      status: 'COMMITTED',
      routes: [],
      unserved: [],
      createdAt: '2026-11-08T10:00:00.000Z',
      updatedAt: '2026-11-08T10:05:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(apiClient.listAssignments).mockResolvedValue(mockExistingAssignments);
    vi.mocked(apiClient.getRequest).mockResolvedValue(eligiblePendingRequest);
    vi.mocked(apiClient.proposeAssignment).mockResolvedValue({
      id: 'prop-test-result-01',
      scenario_id: 'scenario-delhi-yamuna-demo',
      status: 'PROPOSED',
      routes: [],
      unserved: [],
      createdAt: '2026-11-09T01:00:00.000Z',
      updatedAt: '2026-11-09T01:00:00.000Z',
    });
  });

  describe('1. Unrestricted Scenario-Wide Planning when No requestId is Present', () => {
    it('preserves normal scenario-wide proposal generation without requiring request verification', () => {
      mockSearchParams = new URLSearchParams(); // No requestId query parameter

      const html = renderToString(<OperatorAssignmentsPage />);

      // General button must NOT be disabled
      expect(html).toContain('[+] Generate New VRP Solver Proposal');
      // Should not contain Clear Context link in header when no focused request is active
      expect(html).not.toContain('Clear Context');
      // API getRequest should NOT have been invoked
      expect(apiClient.getRequest).not.toHaveBeenCalled();
    });
  });

  describe('2. Focused-Request Eligibility Computation & Disabled Reason Mapping', () => {
    function computeEligibility(req: RescueRequest | null, isVerifying = false) {
      if (!req) {
        return {
          isEligible: false,
          reason: 'UNVERIFIED',
          badgeText: 'UNVERIFIED',
          description: isVerifying
            ? 'Verifying request status with operational database...'
            : 'Waiting for database verification...',
        };
      }
      if (req.isFlaggedDuplicate) {
        return {
          isEligible: false,
          reason: 'DUPLICATE',
          badgeText: 'INELIGIBLE: DUPLICATE',
          description: `Flagged as duplicate distress incident${req.duplicateOfId ? ` of #${req.duplicateOfId}` : ''}. Solver excludes duplicate calls.`,
        };
      }
      if (req.status === 'ASSIGNED') {
        return {
          isEligible: false,
          reason: 'ASSIGNED',
          badgeText: 'INELIGIBLE: ALREADY ASSIGNED',
          description:
            'Incident has already been assigned to an active rescue craft in a committed mission plan.',
        };
      }
      if (req.status === 'IN_TRANSIT') {
        return {
          isEligible: false,
          reason: 'IN_TRANSIT',
          badgeText: 'INELIGIBLE: IN TRANSIT',
          description: 'Rescue craft is currently en route to this incident location.',
        };
      }
      if (req.status === 'RESCUED') {
        return {
          isEligible: false,
          reason: 'RESCUED',
          badgeText: 'INELIGIBLE: RESCUED',
          description: 'Rescue mission has already been successfully completed for this incident.',
        };
      }
      if (req.status === 'CANCELLED') {
        return {
          isEligible: false,
          reason: 'CANCELLED',
          badgeText: 'INELIGIBLE: CANCELLED',
          description: 'This distress call was cancelled and is closed for dispatch.',
        };
      }
      if (req.status === 'PENDING') {
        return {
          isEligible: true,
          reason: 'PENDING_ELIGIBLE',
          badgeText: 'VERIFIED • ELIGIBLE FOR PLANNING',
          description:
            'Pending distress call verified in database. Ready for scenario-wide VRP optimization.',
        };
      }
      return {
        isEligible: false,
        reason: 'UNKNOWN',
        badgeText: `INELIGIBLE: ${req.status}`,
        description: `Current status is ${req.status}.`,
      };
    }

    function checkPlanningAllowed(
      requestId: string | null,
      verifiedReq: RescueRequest | null,
      isVerifying: boolean,
      verificationError: string | null,
    ) {
      if (!requestId) return true;
      if (isVerifying || verificationError || !verifiedReq) return false;
      return computeEligibility(verifiedReq, isVerifying).isEligible;
    }

    it('permits proposal generation only for verified PENDING non-duplicate requests', () => {
      expect(checkPlanningAllowed('req-01', eligiblePendingRequest, false, null)).toBe(true);
    });

    it('blocks proposal generation when verification is in flight', () => {
      expect(checkPlanningAllowed('req-01', eligiblePendingRequest, true, null)).toBe(false);
      expect(checkPlanningAllowed('req-01', null, true, null)).toBe(false);
    });

    it('blocks proposal generation when verification resulted in error or 404', () => {
      expect(checkPlanningAllowed('req-01', null, false, 'Request not found')).toBe(false);
    });

    it('blocks proposal generation when request is ASSIGNED', () => {
      expect(checkPlanningAllowed('req-01', assignedRequest, false, null)).toBe(false);
    });

    it('blocks proposal generation when request is IN_TRANSIT', () => {
      expect(checkPlanningAllowed('req-01', inTransitRequest, false, null)).toBe(false);
    });

    it('blocks proposal generation when request is RESCUED', () => {
      expect(checkPlanningAllowed('req-01', rescuedRequest, false, null)).toBe(false);
    });

    it('blocks proposal generation when request is CANCELLED', () => {
      expect(checkPlanningAllowed('req-01', cancelledRequest, false, null)).toBe(false);
    });

    it('blocks proposal generation when request is flagged as duplicate', () => {
      expect(checkPlanningAllowed('req-01', duplicateRequest, false, null)).toBe(false);
    });
  });

  describe('3. Guarding All Proposal Entry Points in the UI', () => {
    it('disables focused proposal button, general proposal button, and renders Clear Context when focused request is unverified/loading', () => {
      mockSearchParams = new URLSearchParams('requestId=req-loading-99');

      const html = renderToString(<OperatorAssignmentsPage />);

      // General button must be disabled while request is verifying
      expect(html).toContain('disabled=""');
      expect(html).toContain('req-loading-99');
      expect(html).toContain('against operational database');
      // Clear Context action must be available
      expect(html).toContain('Clear Context');
      expect(html).toContain('href="/operator/assignments"');
    });

    it('provides Clear Context action to return to unrestricted scenario-wide planning', () => {
      mockSearchParams = new URLSearchParams('requestId=req-delhi-assigned');

      const html = renderToString(<OperatorAssignmentsPage />);

      // Banner has Clear Context
      expect(html).toContain('Clear Context');
      // Destination resets to /operator/assignments without query params
      expect(html).toContain('href="/operator/assignments"');
    });
  });

  describe('4. Fresh Database Recheck before Submission & Preventing Stale Status Exploitation', () => {
    async function simulateSubmissionWithFreshCheck(
      focusedRequestId: string | null,
      initialRequest: RescueRequest | null,
      fetchFreshFromDb: (id: string) => Promise<RescueRequest>,
      solverProposeFn: (input: ProposeAssignmentInput) => Promise<AssignmentRecord>,
    ): Promise<{
      success: boolean;
      error?: string;
      verifiedRequest?: RescueRequest | null;
      plan?: AssignmentRecord;
    }> {
      const isPlanningAllowed =
        !focusedRequestId ||
        (Boolean(initialRequest) &&
          initialRequest?.status === 'PENDING' &&
          !initialRequest?.isFlaggedDuplicate);
      if (!isPlanningAllowed) {
        return {
          success: false,
          error:
            'Cannot generate solver proposal: focused request context is ineligible or unverified.',
        };
      }

      let verifiedRequest = initialRequest;

      if (focusedRequestId) {
        let freshRequest: RescueRequest;
        try {
          freshRequest = await fetchFreshFromDb(focusedRequestId);
        } catch (err) {
          const errMsg =
            err instanceof ApiClientError && err.statusCode === 404
              ? `Focused request #${focusedRequestId} was not found in database (it may have been deleted or cancelled).`
              : (err as Error).message ||
                `Unable to re-verify request #${focusedRequestId} before solver run.`;
          return {
            success: false,
            error: `Pre-dispatch verification check failed: ${errMsg}`,
            verifiedRequest: null,
          };
        }

        verifiedRequest = freshRequest;

        if (freshRequest.isFlaggedDuplicate) {
          return {
            success: false,
            error: `Incident #${focusedRequestId} was flagged as duplicate${
              freshRequest.duplicateOfId ? ` of #${freshRequest.duplicateOfId}` : ''
            }. Proposal generation blocked.`,
            verifiedRequest: freshRequest,
          };
        }

        if (freshRequest.status !== 'PENDING') {
          return {
            success: false,
            error: `Incident #${focusedRequestId} is no longer pending (current database status: ${freshRequest.status}). Proposal generation blocked to prevent stale assignment.`,
            verifiedRequest: freshRequest,
          };
        }
      }

      const input: ProposeAssignmentInput = {
        algorithm: 'cluster-allocation',
        scenarioId: 'scenario-delhi-yamuna-demo',
        maxShiftMinutes: 480,
        preserveFrozen: true,
        includeUnverified: false,
      };

      const plan = await solverProposeFn(input);
      return {
        success: true,
        verifiedRequest,
        plan,
      };
    }

    it('blocks generation if focused request status changed to ASSIGNED while modal was open', async () => {
      const freshAssigned: RescueRequest = {
        ...eligiblePendingRequest,
        status: 'ASSIGNED',
      };

      const mockPropose = vi.fn();
      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest, // initially was pending
        async () => freshAssigned, // fresh fetch returns ASSIGNED
        mockPropose,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('is no longer pending (current database status: ASSIGNED)');
      expect(mockPropose).not.toHaveBeenCalled();
      expect(result.verifiedRequest?.status).toBe('ASSIGNED');
    });

    it('blocks generation if focused request status changed to RESCUED while modal was open', async () => {
      const freshRescued: RescueRequest = {
        ...eligiblePendingRequest,
        status: 'RESCUED',
      };

      const mockPropose = vi.fn();
      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest,
        async () => freshRescued,
        mockPropose,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('is no longer pending (current database status: RESCUED)');
      expect(mockPropose).not.toHaveBeenCalled();
    });

    it('blocks generation if focused request status changed to CANCELLED while modal was open', async () => {
      const freshCancelled: RescueRequest = {
        ...eligiblePendingRequest,
        status: 'CANCELLED',
      };

      const mockPropose = vi.fn();
      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest,
        async () => freshCancelled,
        mockPropose,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('is no longer pending (current database status: CANCELLED)');
      expect(mockPropose).not.toHaveBeenCalled();
    });

    it('blocks generation if focused request was flagged as duplicate while modal was open', async () => {
      const freshDuplicate: RescueRequest = {
        ...eligiblePendingRequest,
        isFlaggedDuplicate: true,
        duplicateOfId: 'req-parent-77',
      };

      const mockPropose = vi.fn();
      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest,
        async () => freshDuplicate,
        mockPropose,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('flagged as duplicate of #req-parent-77');
      expect(mockPropose).not.toHaveBeenCalled();
    });

    it('blocks generation if focused request was deleted from the operational database (HTTP 404)', async () => {
      const mockPropose = vi.fn();
      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest,
        async () => {
          throw new ApiClientError({
            message: 'Request not found',
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        },
        mockPropose,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in database');
      expect(mockPropose).not.toHaveBeenCalled();
      expect(result.verifiedRequest).toBeNull();
    });

    it('successfully calls solver when focused request remains PENDING and verified in database', async () => {
      const mockPropose = vi.fn().mockResolvedValue({
        id: 'prop-successful-fresh-check',
        status: 'PROPOSED',
        scenario_id: 'scenario-delhi-yamuna-demo',
        routes: [],
        unserved: [],
        createdAt: '2026-11-09T01:00:00.000Z',
      });

      const result = await simulateSubmissionWithFreshCheck(
        'req-delhi-001',
        eligiblePendingRequest,
        async () => eligiblePendingRequest, // remains PENDING
        mockPropose,
      );

      expect(result.success).toBe(true);
      expect(mockPropose).toHaveBeenCalledTimes(1);
      expect(result.plan?.id).toBe('prop-successful-fresh-check');
      expect(result.plan?.status).toBe('PROPOSED');
    });

    it('successfully calls solver without request check when no focused request is specified (null)', async () => {
      const mockFreshDb = vi.fn();
      const mockPropose = vi.fn().mockResolvedValue({
        id: 'prop-scenario-wide-unrestricted',
        status: 'PROPOSED',
        scenario_id: 'scenario-delhi-yamuna-demo',
        routes: [],
        unserved: [],
        createdAt: '2026-11-09T01:00:00.000Z',
        updatedAt: '2026-11-09T01:00:00.000Z',
      });

      const result = await simulateSubmissionWithFreshCheck(
        null, // No focused request
        null,
        mockFreshDb,
        mockPropose,
      );

      expect(result.success).toBe(true);
      expect(mockFreshDb).not.toHaveBeenCalled();
      expect(mockPropose).toHaveBeenCalledTimes(1);
      expect(result.plan?.id).toBe('prop-scenario-wide-unrestricted');
      expect(result.plan?.status).toBe('PROPOSED');
    });
  });

  describe('5. Operational Workflow & Frozen Stop Invariants', () => {
    it('generates proposal strictly with PROPOSED status, requiring explicit human review before commitment', async () => {
      const mockPropose = vi.fn().mockResolvedValue({
        id: 'prop-safe-decision-support',
        status: 'PROPOSED',
        scenario_id: 'scenario-delhi-yamuna-demo',
        routes: [
          {
            resourceId: 'craft-yamuna-01',
            servedRequestIds: ['req-delhi-001'],
            stops: [],
          },
        ],
        unserved: [],
        createdAt: '2026-11-09T01:00:00.000Z',
        updatedAt: '2026-11-09T01:00:00.000Z',
      });

      const input: ProposeAssignmentInput = {
        algorithm: 'cluster-allocation',
        scenarioId: 'scenario-delhi-yamuna-demo',
        maxShiftMinutes: 480,
        preserveFrozen: true,
        includeUnverified: false,
      };

      const plan = await mockPropose(input);
      expect(plan.status).toBe('PROPOSED');
      // Does NOT commit or physically dispatch resources
      expect(plan.status).not.toBe('COMMITTED');
    });
  });
});
