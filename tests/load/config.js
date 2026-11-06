/**
 * FloodRelay k6 Load Testing Configuration
 *
 * Supports configurable profiles:
 * - smoke: 5 VUs, 30s
 * - baseline: 10 -> 25 -> 50 VUs ramp-up (stable state)
 * - stress: 100 -> 250 -> 500 VUs
 * - scalability: up to 1,000 VUs (isolated authorized environment only)
 */

export const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
export const LOAD_PROFILE = (__ENV.LOAD_PROFILE || 'smoke').toLowerCase();
export const TEST_DATASET_ID = __ENV.TEST_DATASET_ID || 'delhi-yamuna-basin';

// Operator Credentials (read ONLY from environment variables; zero hardcoded defaults)
export const OPERATOR_USERNAME = __ENV.LOAD_TEST_USERNAME || __ENV.OPERATOR_USERNAME || '';
export const OPERATOR_PASSWORD = __ENV.LOAD_TEST_PASSWORD || __ENV.OPERATOR_PASSWORD || '';

/**
 * Returns k6 execution options based on LOAD_PROFILE
 */
export function getOptions() {
  const customVUs = __ENV.VIRTUAL_USERS ? parseInt(__ENV.VIRTUAL_USERS, 10) : null;
  const customDuration = __ENV.TEST_DURATION || null;

  if (customVUs && customDuration) {
    return {
      vus: customVUs,
      duration: customDuration,
      thresholds: getStandardThresholds(),
    };
  }

  switch (LOAD_PROFILE) {
    case 'baseline':
      return {
        stages: [
          { duration: '30s', target: 10 },
          { duration: '1m', target: 25 },
          { duration: '1m', target: 50 },
          { duration: '30s', target: 0 },
        ],
        thresholds: getStandardThresholds(),
      };

    case 'stress':
      return {
        stages: [
          { duration: '30s', target: 50 },
          { duration: '1m', target: 100 },
          { duration: '1m', target: 250 },
          { duration: '1m', target: 500 },
          { duration: '30s', target: 0 },
        ],
        thresholds: {
          http_req_failed: ['rate<0.05'], // Allow up to 5% failures under heavy stress saturation
          http_req_duration: ['p(95)<3000'],
        },
      };

    case 'scalability':
      return {
        stages: [
          { duration: '1m', target: 100 },
          { duration: '2m', target: 500 },
          { duration: '2m', target: 1000 },
          { duration: '1m', target: 0 },
        ],
        thresholds: {
          http_req_failed: ['rate<0.10'],
          http_req_duration: ['p(95)<5000'],
        },
      };

    case 'smoke':
    default:
      return {
        vus: 5,
        duration: '30s',
        thresholds: {
          http_req_failed: ['rate<0.01'], // 0% 5xx goal
          http_req_duration: ['p(95)<1000'], // Under 1s p95
        },
      };
  }
}

/**
 * Engineering Acceptance Thresholds (Phase 6 Policy)
 */
export function getStandardThresholds() {
  return {
    // Zero tolerance for 5xx errors in baseline
    http_req_failed: ['rate<0.01'],
    // Baseline API read p95 < 1000ms
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    // Custom domain rates & invariants
    citizen_intake_success_rate: ['rate>0.98'],
    data_integrity_violations: ['count==0'],
    frozen_stop_violations: ['count==0'],
    unauthorized_commits: ['count==0'],
    repair_unexpected_failure: ['count==0'],
  };
}
