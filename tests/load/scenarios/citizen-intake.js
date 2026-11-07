import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import {
  generateValidRequest,
  generateInvalidRequest,
  generateDuplicateRequest,
  generateIdempotencyKey,
} from '../helpers/data.js';

export const citizenIntakeSuccessRate = new Rate('citizen_intake_success_rate');
export const dataIntegrityViolations = new Counter('data_integrity_violations');

/**
 * Citizen Rescue Request Intake Scenario
 *
 * Tests:
 * 1. Valid intake -> HTTP 201 with status PENDING
 * 2. Idempotent replay -> HTTP 200 with idempotent: true and identical ID
 * 3. Spatial duplicate report -> HTTP 201 with isFlaggedDuplicate: true and duplicateOfId
 * 4. Invalid request -> HTTP 400 with VALIDATION_ERROR
 */
export function runCitizenIntake(baseUrl) {
  const idempotencyKey = generateIdempotencyKey();
  const requestPayload = generateValidRequest(idempotencyKey);

  // 1. Submit Valid Request
  const res1 = http.post(`${baseUrl}/requests`, JSON.stringify(requestPayload), {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    tags: { name: 'POST /requests (New)' },
  });

  const ok1 = check(res1, {
    'intake returns 201 Created': (r) => r.status === 201,
    'intake returns valid request ID': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          body && body.data && typeof body.data.id === 'string' && body.data.status === 'PENDING'
        );
      } catch (_) {
        return false;
      }
    },
  });

  citizenIntakeSuccessRate.add(ok1);
  if (!ok1) {
    dataIntegrityViolations.add(1);
    return;
  }

  const createdData = JSON.parse(res1.body).data;
  const requestId = createdData.id;

  // 2. Replay with exact same Idempotency-Key (Idempotency Contract)
  const res2 = http.post(`${baseUrl}/requests`, JSON.stringify(requestPayload), {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    tags: { name: 'POST /requests (Idempotent Replay)' },
  });

  const ok2 = check(res2, {
    'idempotent replay returns 200 OK': (r) => r.status === 200,
    'idempotent replay returns idempotent: true': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.idempotent === true && body.data.id === requestId;
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok2) {
    dataIntegrityViolations.add(1);
  }

  // 3. Submit Spatial-Temporal Duplicate (Must be FLAGGED, NOT DROPPED)
  const dupPayload = generateDuplicateRequest(createdData);
  const res3 = http.post(`${baseUrl}/requests`, JSON.stringify(dupPayload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /requests (Duplicate Flagging)' },
  });

  const ok3 = check(res3, {
    'suspected duplicate returns 201 Created': (r) => r.status === 201,
    'suspected duplicate is flagged without dropping': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          body &&
          body.data &&
          body.data.isFlaggedDuplicate === true &&
          typeof body.data.duplicateOfId === 'string'
        );
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok3) {
    // If a duplicate disappears or fails, flag data integrity issue
    dataIntegrityViolations.add(1);
  }

  // 4. Submit Invalid Request (Validation Integrity - expected 400 Bad Request)
  const invalidPayload = generateInvalidRequest();
  const res4 = http.post(`${baseUrl}/requests`, JSON.stringify(invalidPayload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /requests (Invalid Input)' },
    responseCallback: http.expectedStatuses(400),
  });

  check(res4, {
    'invalid request rejected with 400 Bad Request': (r) => r.status === 400,
  });
}
