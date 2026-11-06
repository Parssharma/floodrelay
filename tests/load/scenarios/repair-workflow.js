import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { getAuthHeaders } from '../helpers/auth.js';
import { classifyRepairOutcome } from '../helpers/repairClassifier.js';

// Explicit outcome metrics (Issue 1 requirements)
export const repairAttempted = new Counter('repair_attempted');
export const repairProposed = new Counter('repair_proposed');
export const repairNoFeasible = new Counter('repair_no_feasible');
export const repairVersionConflict = new Counter('repair_version_conflict');
export const repairUnavailable = new Counter('repair_unavailable');
export const repairSkippedNoEvent = new Counter('repair_skipped_no_event');
export const repairUnexpectedFailure = new Counter('repair_unexpected_failure');
export const repairProposalVerified = new Counter('repair_proposal_verified');

export const frozenStopViolations = new Counter('frozen_stop_violations');
export const unauthorizedCommits = new Counter('unauthorized_commits');

// Re-export classifier for module consumers
export { classifyRepairOutcome };

/**
 * Assignment Repair Load Scenario
 *
 * Requirements:
 * 1. Must originate from actual authorized POST /operations/repair
 * 2. PROPOSED response validated against actual contract
 * 3. Proposal verified by retrieving from authoritative GET /assignments/:id
 * 4. Verify proposal status is PROPOSED, not COMMITTED
 * 5. Verify frozen-stop preservation
 * 6. Missing event counts as SKIPPED, never successful repair
 * 7. HTTP 503 counts as UNAVAILABLE
 * 8. HTTP 409 counts as VERSION_CONFLICT
 * 9. NO_FEASIBLE_REPAIR reported separately
 * 10. Unexpected errors increment repairUnexpectedFailure
 * 11. Ordinary GET requests never increment solver-repair success counters
 */
export function runRepairWorkflow(baseUrl, username, password) {
  const { headers } = getAuthHeaders(baseUrl, username, password);

  // 1. Fetch recent events to identify an event eligible for repair
  const resEvents = http.get(`${baseUrl}/operations/events?limit=25`, {
    headers,
    tags: { name: 'GET /operations/events (Repair Prep)' },
  });

  if (resEvents.status !== 200) {
    repairUnexpectedFailure.add(1);
    return;
  }

  let repairableEvent = null;
  try {
    const body = JSON.parse(resEvents.body);
    if (body.data && Array.isArray(body.data)) {
      // Find an event suitable for repair
      repairableEvent =
        body.data.find((e) =>
          [
            'REQUEST_CREATED',
            'RESOURCE_OFFLINE',
            'ROAD_BLOCKED',
            'REQUEST_CANCELLED',
            'REQUEST_FLAGGED_DUPLICATE',
          ].includes(e.event_type),
        ) || null;
    }
  } catch (_) {
    // parse failure
  }

  // If no repairable event exists, count as SKIPPED.
  // CRITICAL: NEVER substitute GET /assignments as a "successful repair"!
  if (!repairableEvent) {
    repairSkippedNoEvent.add(1);
    classifyRepairOutcome(null);
    return;
  }

  repairAttempted.add(1);

  // 2. Request incremental repair proposal for this specific event
  const repairPayload = JSON.stringify({
    eventId: repairableEvent.id,
  });

  const resRepair = http.post(`${baseUrl}/operations/repair`, repairPayload, {
    headers,
    tags: { name: 'POST /operations/repair' },
    responseCallback: http.expectedStatuses(200, 400, 404, 409, 500, 503),
  });

  // 3. If PROPOSED, verify persistence via GET /assignments/:id
  let resVerify = null;
  if (resRepair.status === 200) {
    try {
      const parsed = JSON.parse(resRepair.body);
      const proposalId = parsed?.data?.proposalId;
      if (proposalId) {
        resVerify = http.get(`${baseUrl}/assignments/${proposalId}`, {
          headers,
          tags: { name: 'GET /assignments/:id (Verify Proposal)' },
          responseCallback: http.expectedStatuses(200, 404),
        });
      }
    } catch (_) {
      // parse failure
    }
  }

  // 4. Classify outcome
  const outcome = classifyRepairOutcome(resRepair, resVerify);

  switch (outcome.category) {
    case 'PROPOSED_VERIFIED':
      repairProposed.add(1);
      repairProposalVerified.add(1);
      check(resRepair, {
        'repair proposal status is PROPOSED and verified': () => true,
        'repair proposal is never automatically COMMITTED': () => outcome.isUncommitted,
        'frozen stops invariant preserved': () => outcome.isFrozenPreserved,
      });
      break;

    case 'PROPOSED_UNVERIFIED':
      repairProposed.add(1);
      check(resRepair, {
        'repair returns proposal': () => true,
        'repair proposal is never automatically COMMITTED': () => outcome.isUncommitted,
        'frozen stops invariant preserved': () => outcome.isFrozenPreserved,
      });
      break;

    case 'NO_FEASIBLE':
      repairNoFeasible.add(1);
      check(resRepair, {
        'repair handled infeasible proposal gracefully': () => true,
      });
      break;

    case 'VERSION_CONFLICT':
      repairVersionConflict.add(1);
      check(resRepair, {
        'version conflict handled with 409': () => true,
      });
      break;

    case 'UNAVAILABLE':
      repairUnavailable.add(1);
      check(resRepair, {
        'solver engine unavailable handled with 503': () => true,
      });
      break;

    case 'UNEXPECTED_FAILURE':
    default:
      repairUnexpectedFailure.add(1);
      if (!outcome.isFrozenPreserved) {
        frozenStopViolations.add(1);
      }
      if (!outcome.isUncommitted) {
        unauthorizedCommits.add(1);
      }
      check(resRepair, {
        'repair failed unexpectedly': () => false,
      });
      break;
  }
}
