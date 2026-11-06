import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { getAuthHeaders } from '../helpers/auth.js';

export const operatorPollingSuccessRate = new Rate('operator_polling_success_rate');

/**
 * Operator Polling Scenario
 *
 * Simulates concurrent operator dashboard polling cycles:
 * - GET /requests?status=PENDING&limit=50
 * - GET /assignments
 * - GET /operations/events?limit=25
 */
export function runOperatorPolling(baseUrl, username, password) {
  const { headers } = getAuthHeaders(baseUrl, username, password);

  // 1. Poll Rescue Requests List
  const resRequests = http.get(`${baseUrl}/requests?status=PENDING&limit=50`, {
    headers,
    tags: { name: 'GET /requests (Polling)' },
  });

  const okReq = check(resRequests, {
    'GET /requests returns 200 OK': (r) => r.status === 200,
    'GET /requests returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && Array.isArray(body.data);
      } catch (_) {
        return false;
      }
    },
  });

  // 2. Poll Assignments List
  const resAssignments = http.get(`${baseUrl}/assignments`, {
    headers,
    tags: { name: 'GET /assignments (Polling)' },
  });

  const okAssign = check(resAssignments, {
    'GET /assignments returns 200 OK': (r) => r.status === 200,
    'GET /assignments returns data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && Array.isArray(body.data || body);
      } catch (_) {
        return false;
      }
    },
  });

  // 3. Poll Operational Events
  const resEvents = http.get(`${baseUrl}/operations/events?limit=25`, {
    headers,
    tags: { name: 'GET /operations/events (Polling)' },
  });

  const okEvents = check(resEvents, {
    'GET /operations/events returns 200 OK': (r) => r.status === 200,
    'GET /operations/events returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && Array.isArray(body.data);
      } catch (_) {
        return false;
      }
    },
  });

  operatorPollingSuccessRate.add(okReq && okAssign && okEvents);
}
