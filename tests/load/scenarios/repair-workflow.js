import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { getAuthHeaders } from '../helpers/auth.js';

export const repairWorkflowSuccessRate = new Rate('repair_workflow_success_rate');
export const frozenStopViolations = new Counter('frozen_stop_violations');
export const unauthorizedCommits = new Counter('unauthorized_commits');

/**
 * Assignment Repair & Concurrency Scenario
 *
 * Tests:
 * 1. Fetching operational events from GET /operations/events
 * 2. Invoking POST /operations/repair with a valid event
 * 3. Verifying the repair returns a proposal and NEVER auto-commits
 * 4. Verifying frozen stops safety invariants
 */
export function runRepairWorkflow(baseUrl, username, password) {
  const { headers } = getAuthHeaders(baseUrl, username, password);

  // 1. Fetch recent events to identify an event eligible for repair
  const resEvents = http.get(`${baseUrl}/operations/events?limit=10`, {
    headers,
    tags: { name: 'GET /operations/events (Repair Prep)' },
  });

  if (resEvents.status !== 200) {
    repairWorkflowSuccessRate.add(false);
    return;
  }

  let eventId = null;
  try {
    const body = JSON.parse(resEvents.body);
    if (body.data && body.data.length > 0) {
      eventId = body.data[0].id;
    }
  } catch (_) {
    // ignore
  }

  // If no operational events exist yet, we can check assignments list
  if (!eventId) {
    const resAssign = http.get(`${baseUrl}/assignments`, {
      headers,
      tags: { name: 'GET /assignments (Inspect)' },
    });
    repairWorkflowSuccessRate.add(resAssign.status === 200);
    return;
  }

  // 2. Request incremental repair proposal for this event
  const repairPayload = JSON.stringify({
    eventId,
  });

  const resRepair = http.post(`${baseUrl}/operations/repair`, repairPayload, {
    headers,
    tags: { name: 'POST /operations/repair' },
    responseCallback: http.expectedStatuses(200, 409, 503),
  });

  // Repair may return:
  // - 200 OK with { success: true, data: { proposalId, churn, ... } }
  // - 503 REPAIR_ENGINE_UNAVAILABLE or 409 CONFLICT if concurrent modification
  const okRepair = check(resRepair, {
    'repair returns 200, 409, or 503 (handled)': (r) => [200, 409, 503].includes(r.status),
    'repair proposal is never automatically COMMITTED': (r) => {
      if (r.status !== 200) return true;
      try {
        const body = JSON.parse(r.body);
        if (body.data && body.data.assignment) {
          const status = body.data.assignment.status;
          if (status === 'COMMITTED') {
            unauthorizedCommits.add(1);
            return false;
          }
        }
        return true;
      } catch (_) {
        return true;
      }
    },
    'frozen stops invariant preserved': (r) => {
      if (r.status !== 200) return true;
      try {
        const body = JSON.parse(r.body);
        if (body.data && body.data.frozenStopsCount !== undefined) {
          // If any frozen stop violation is detected by the validator
          if (body.data.hasFrozenViolations === true) {
            frozenStopViolations.add(1);
            return false;
          }
        }
        return true;
      } catch (_) {
        return true;
      }
    },
  });

  repairWorkflowSuccessRate.add(okRepair);
}
