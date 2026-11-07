/**
 * Pure outcome classification logic for assignment plan repair.
 * Decoupled from k6 runtime to enable automated unit testing.
 *
 * @param {object|null} repairRes - Response from POST /operations/repair (status, body)
 * @param {object|null} [verifyRes] - Optional response from GET /assignments/:id
 * @returns {{
 *   category: 'PROPOSED_VERIFIED' | 'PROPOSED_UNVERIFIED' | 'NO_FEASIBLE' | 'VERSION_CONFLICT' | 'UNAVAILABLE' | 'SKIPPED_NO_EVENT' | 'UNEXPECTED_FAILURE',
 *   proposalId: string | null,
 *   isFrozenPreserved: boolean,
 *   isUncommitted: boolean,
 *   errorDetail?: string,
 * }}
 */
export function classifyRepairOutcome(repairRes, verifyRes = null) {
  if (!repairRes) {
    return {
      category: 'SKIPPED_NO_EVENT',
      proposalId: null,
      isFrozenPreserved: true,
      isUncommitted: true,
      errorDetail: 'No repairable operational event available',
    };
  }

  const status = repairRes.status;
  let parsedBody = null;
  try {
    parsedBody = typeof repairRes.body === 'string' ? JSON.parse(repairRes.body) : repairRes.body;
  } catch (_) {
    // Body is not JSON
  }

  // 1. Solver Unavailable (HTTP 503)
  if (status === 503) {
    return {
      category: 'UNAVAILABLE',
      proposalId: null,
      isFrozenPreserved: true,
      isUncommitted: true,
      errorDetail: parsedBody?.error?.code || 'REPAIR_ENGINE_UNAVAILABLE',
    };
  }

  // 2. Concurrency Version Conflict (HTTP 409)
  if (status === 409) {
    return {
      category: 'VERSION_CONFLICT',
      proposalId: null,
      isFrozenPreserved: true,
      isUncommitted: true,
      errorDetail: parsedBody?.error?.code || 'VERSION_CONFLICT',
    };
  }

  // 3. Successful Solver Computation (HTTP 200)
  if (status === 200 && parsedBody && parsedBody.success) {
    const data = parsedBody.data;
    if (!data) {
      return {
        category: 'UNEXPECTED_FAILURE',
        proposalId: null,
        isFrozenPreserved: true,
        isUncommitted: true,
        errorDetail: 'Response missing data payload',
      };
    }

    // A. Infeasible Repair
    if (data.status === 'NO_FEASIBLE_REPAIR') {
      return {
        category: 'NO_FEASIBLE',
        proposalId: null,
        isFrozenPreserved: true,
        isUncommitted: true,
      };
    }

    // B. Proposed Repair
    if (data.status === 'PROPOSED') {
      const proposalId = data.proposalId;
      if (!proposalId || typeof proposalId !== 'string') {
        return {
          category: 'UNEXPECTED_FAILURE',
          proposalId: null,
          isFrozenPreserved: true,
          isUncommitted: true,
          errorDetail: 'PROPOSED status without valid proposalId string',
        };
      }

      // Check frozen-stop safety flag if returned in data
      if (data.hasFrozenViolations === true) {
        return {
          category: 'UNEXPECTED_FAILURE',
          proposalId,
          isFrozenPreserved: false,
          isUncommitted: true,
          errorDetail: 'Frozen-stop invariant violation indicated in repair response',
        };
      }

      // If verification response was performed, inspect persisted state
      if (verifyRes) {
        let verifyBody = null;
        try {
          verifyBody =
            typeof verifyRes.body === 'string' ? JSON.parse(verifyRes.body) : verifyRes.body;
        } catch (_) {
          // ignore
        }

        if (verifyRes.status !== 200 || !verifyBody?.data) {
          return {
            category: 'UNEXPECTED_FAILURE',
            proposalId,
            isFrozenPreserved: true,
            isUncommitted: true,
            errorDetail: `Failed to retrieve persisted proposal from GET /assignments/${proposalId}`,
          };
        }

        const persisted = verifyBody.data;
        if (persisted.status === 'COMMITTED') {
          return {
            category: 'UNEXPECTED_FAILURE',
            proposalId,
            isFrozenPreserved: true,
            isUncommitted: false,
            errorDetail: 'Proposal status is COMMITTED in database! Prohibited auto-commit.',
          };
        }

        if (persisted.status === 'PROPOSED' && persisted.id === proposalId) {
          return {
            category: 'PROPOSED_VERIFIED',
            proposalId,
            isFrozenPreserved: true,
            isUncommitted: true,
          };
        }
      }

      return {
        category: 'PROPOSED_UNVERIFIED',
        proposalId,
        isFrozenPreserved: true,
        isUncommitted: true,
      };
    }
  }

  return {
    category: 'UNEXPECTED_FAILURE',
    proposalId: null,
    isFrozenPreserved: true,
    isUncommitted: true,
    errorDetail: `Unexpected response status ${status}`,
  };
}
