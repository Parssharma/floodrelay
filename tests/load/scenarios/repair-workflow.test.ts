import { describe, it, expect } from 'vitest';
import { classifyRepairOutcome } from '../helpers/repairClassifier.js';
import { createAuthManager } from '../helpers/authManager.js';

describe('Repair Workflow Outcome Classification (Issue 1)', () => {
  it('classifies missing event as SKIPPED_NO_EVENT with zero proposals', () => {
    const outcome = classifyRepairOutcome(null);
    expect(outcome.category).toBe('SKIPPED_NO_EVENT');
    expect(outcome.proposalId).toBeNull();
    expect(outcome.isFrozenPreserved).toBe(true);
    expect(outcome.isUncommitted).toBe(true);
  });

  it('classifies HTTP 503 as UNAVAILABLE with zero proposals', () => {
    const res = {
      status: 503,
      body: JSON.stringify({
        error: {
          code: 'REPAIR_ENGINE_UNAVAILABLE',
          message: 'Incremental repair engine is not available',
        },
      }),
    };
    const outcome = classifyRepairOutcome(res);
    expect(outcome.category).toBe('UNAVAILABLE');
    expect(outcome.proposalId).toBeNull();
    expect(outcome.errorDetail).toBe('REPAIR_ENGINE_UNAVAILABLE');
  });

  it('classifies HTTP 409 as VERSION_CONFLICT with zero proposals', () => {
    const res = {
      status: 409,
      body: JSON.stringify({
        error: {
          code: 'VERSION_CONFLICT',
          message: 'Entity version mismatch',
        },
      }),
    };
    const outcome = classifyRepairOutcome(res);
    expect(outcome.category).toBe('VERSION_CONFLICT');
    expect(outcome.proposalId).toBeNull();
    expect(outcome.errorDetail).toBe('VERSION_CONFLICT');
  });

  it('classifies NO_FEASIBLE_REPAIR as NO_FEASIBLE with zero proposals', () => {
    const res = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'NO_FEASIBLE_REPAIR',
          message: 'No vehicle has capacity or shift time remaining',
        },
      }),
    };
    const outcome = classifyRepairOutcome(res);
    expect(outcome.category).toBe('NO_FEASIBLE');
    expect(outcome.proposalId).toBeNull();
  });

  it('classifies valid PROPOSED response with verified persisted assignment as PROPOSED_VERIFIED', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'asgn-test-123',
          proposedPlan: { routes: [] },
          churn: 0.1,
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          id: 'asgn-test-123',
          status: 'PROPOSED',
          routes: [],
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('PROPOSED_VERIFIED');
    expect(outcome.proposalId).toBe('asgn-test-123');
    expect(outcome.isFrozenPreserved).toBe(true);
    expect(outcome.isUncommitted).toBe(true);
  });

  it('never counts GET /assignments alone as a successful repair (null repairRes)', () => {
    // Calling with null repairRes must result in SKIPPED_NO_EVENT, never PROPOSED
    const outcome = classifyRepairOutcome(null, {
      status: 200,
      body: JSON.stringify({ data: [{ id: 'asgn-1' }] }),
    });
    expect(outcome.category).toBe('SKIPPED_NO_EVENT');
    expect(outcome.proposalId).toBeNull();
  });

  it('fails verification if proposal ID is invalid or not found on GET /assignments/:id', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'asgn-ghost-999',
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 404,
      body: JSON.stringify({ error: { code: 'NOT_FOUND' } }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.errorDetail).toContain('Failed to retrieve persisted proposal');
  });

  it('fails verification if persisted proposal was illegally marked COMMITTED', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'asgn-illegal-commit',
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          id: 'asgn-illegal-commit',
          status: 'COMMITTED', // Prohibited!
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.isUncommitted).toBe(false);
    expect(outcome.errorDetail).toContain('Prohibited auto-commit');
  });

  it('flags UNEXPECTED_FAILURE and frozen-stop violation when hasFrozenViolations is true', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'asgn-frozen-fail',
          hasFrozenViolations: true,
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.isFrozenPreserved).toBe(false);
  });

  it('fails verification if retrieved proposal ID does not match generated proposal ID (mismatched ID)', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'prop-expected-100',
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          id: 'prop-different-200', // Mismatch!
          status: 'PROPOSED',
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.errorDetail).toContain('Mismatched proposal ID');
    expect(outcome.errorDetail).toContain('prop-expected-100');
    expect(outcome.errorDetail).toContain('prop-different-200');
  });

  it('fails verification if persisted proposal status is not PROPOSED (e.g. DRAFT or PENDING)', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'prop-draft-check',
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          id: 'prop-draft-check',
          status: 'DRAFT', // Not PROPOSED!
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.errorDetail).toContain('Persisted proposal status is "DRAFT"');
  });

  it('fails verification if persisted proposal contains frozen-stop violations', () => {
    const repairRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          status: 'PROPOSED',
          proposalId: 'prop-frozen-persisted-fail',
          hasFrozenViolations: false,
        },
      }),
    };
    const verifyRes = {
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          id: 'prop-frozen-persisted-fail',
          status: 'PROPOSED',
          hasFrozenViolations: true, // Invariant violated in persisted record!
        },
      }),
    };
    const outcome = classifyRepairOutcome(repairRes, verifyRes);
    expect(outcome.category).toBe('UNEXPECTED_FAILURE');
    expect(outcome.isFrozenPreserved).toBe(false);
    expect(outcome.errorDetail).toContain(
      'Frozen-stop invariant violation indicated in persisted proposal',
    );
  });
});

describe('Credential Security & Authentication Helper (Issue 2)', () => {
  it('throws clear error when credentials are missing', () => {
    const auth = createAuthManager(() => ({ status: 200 }));
    expect(() => auth('http://localhost:3000', '', '')).toThrow(/Operator credentials missing/);
  });

  it('throws clear error when authentication is rejected (HTTP 401) without logging password', () => {
    const mockPost = () => ({
      status: 401,
      body: JSON.stringify({ error: { message: 'Invalid credentials' } }),
    });
    const auth = createAuthManager(mockPost);
    expect(() => auth('http://localhost:3000', 'operator_test', 'wrong_pass')).toThrow(
      /Failed to authenticate operator "operator_test"/,
    );
  });

  it('authenticates successfully and caches token when valid credentials provided', () => {
    let callCount = 0;
    const mockPost = () => {
      callCount++;
      return {
        status: 200,
        body: JSON.stringify({
          data: {
            token: 'valid_jwt_token_123',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        }),
      };
    };
    const auth = createAuthManager(mockPost);
    const result1 = auth('http://localhost:3000', 'operator_test', 'correct_pass');
    expect(result1.token).toBe('valid_jwt_token_123');
    expect(result1.headers.Authorization).toBe('Bearer valid_jwt_token_123');
    expect(callCount).toBe(1);

    // Second call should use cache
    const result2 = auth('http://localhost:3000', 'operator_test', 'correct_pass');
    expect(result2.token).toBe('valid_jwt_token_123');
    expect(callCount).toBe(1);
  });
});
