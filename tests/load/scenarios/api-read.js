import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

export const apiReadSuccessRate = new Rate('api_read_success_rate');

/**
 * Public & System API Read Scenario
 *
 * Tests lightweight high-throughput baseline reads:
 * - GET /health
 * - GET /openapi.json
 */
export function runApiRead(baseUrl) {
  // 1. Health Endpoint
  const resHealth = http.get(`${baseUrl}/health`, {
    tags: { name: 'GET /health' },
  });

  const okHealth = check(resHealth, {
    'GET /health returns 200 OK': (r) => r.status === 200,
    'GET /health status is ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.status === 'ok';
      } catch (_) {
        return false;
      }
    },
    'GET /health contains no-store cache headers': (r) => {
      const cc = r.headers['Cache-Control'] || r.headers['cache-control'] || '';
      return cc.includes('no-store');
    },
  });

  // 2. OpenAPI Specification
  const resOpenApi = http.get(`${baseUrl}/openapi.json`, {
    tags: { name: 'GET /openapi.json' },
  });

  const okOpenApi = check(resOpenApi, {
    'GET /openapi.json returns 200 OK': (r) => r.status === 200,
    'GET /openapi.json is valid OpenAPI 3.1': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && typeof body.openapi === 'string' && body.openapi.startsWith('3.');
      } catch (_) {
        return false;
      }
    },
  });

  apiReadSuccessRate.add(okHealth && okOpenApi);
}
