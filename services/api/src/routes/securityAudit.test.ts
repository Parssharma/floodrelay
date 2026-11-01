import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { InMemoryAuthRepository, AuthService } from '../services/authService.js';
import type { RequestService } from '../services/requestService.js';

describe('Milestone 3 Security Acceptance Gate & CSRF Defense', () => {
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let inMemoryRepo: InMemoryAuthRepository;

  beforeEach(async () => {
    inMemoryRepo = new InMemoryAuthRepository();
    authService = new AuthService(inMemoryRepo);
    const mockRequestService = {
      submitRequest: vi.fn().mockResolvedValue({
        request: {
          id: 'req-sec-mock-1',
          lat: 29.76,
          lng: -95.36,
          peopleCount: 2,
          urgency: 'HIGH',
          createdAt: new Date().toISOString(),
          source: 'REPORTED',
          verificationStatus: 'UNVERIFIED',
        },
        isFlaggedDuplicate: false,
        duplicateOfId: null,
      }),
      getRequestById: vi.fn().mockResolvedValue(null),
      listRequests: vi.fn().mockResolvedValue([]),
    } as unknown as RequestService;

    app = createApp({ authService, requestService: mockRequestService });

    // Seed test operator
    await inMemoryRepo.insertOperator({
      id: 'op-sec-01',
      username: 'sec_operator',
      password_hash: 'dummyhash',
      salt: 'dummysalt',
      name: 'Security Operator',
      role: 'OPERATOR',
      is_active: true,
    });
  });

  describe('Security Headers & Anti-Caching Invariants', () => {
    it('sets Cache-Control: no-store, no-cache on all API responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, private');
      expect(res.headers['pragma']).toBe('no-cache');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('sets anti-caching headers on auth endpoints', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, private');
    });
  });

  describe('CORS Whitelist & CSRF Origin Protection', () => {
    it('allows cross-origin requests from whitelisted frontend origin', async () => {
      const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('blocks state-changing POST requests from untrusted cross-origin domains (CSRF)', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Origin', 'http://evil-attacker.com')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('CSRF_BLOCKED');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects CORS preflight OPTIONS from untrusted origin', async () => {
      const res = await request(app)
        .options('/assignments/propose')
        .set('Origin', 'http://unauthorized-domain.org');

      expect(res.status).toBe(403);
    });
  });

  describe('Privileged Operational Endpoint Coverage', () => {
    it('rejects anonymous access to GET /requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/requests');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects anonymous access to GET /requests/:id with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/requests/req-12345');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects anonymous access to GET /assignments with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/assignments');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects anonymous access to POST /assignments/propose with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/assignments/propose').send({});
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects anonymous access to POST /assignments/PR-101/commit with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/assignments/PR-101/commit').send({});
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('allows public access to citizen intake POST /requests without authentication', async () => {
      const res = await request(app).post('/requests').send({
        lat: 29.76,
        lng: -95.36,
        peopleCount: 2,
        urgency: 'HIGH',
      });

      // Validates payload and accepts intake (or 201 created with mock/in-memory repo)
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('Cookie Security & Server Session Revocation', () => {
    it('invalidates server-side session in database upon logout', async () => {
      const token = 'test-token-sec-01-at-least-32-chars-long-123456';
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await inMemoryRepo.insertSession(token, 'op-sec-01', expiresAt);
      expect(await authService.validateSession(token)).not.toBeNull();

      // Logout with Bearer token
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutRes.status).toBe(200);

      // Subsequent validation must return null (session deleted from DB)
      expect(await authService.validateSession(token)).toBeNull();

      // Subsequent request using revoked token must fail with 401 SESSION_EXPIRED
      const meRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error?.code).toBe('SESSION_EXPIRED');
    });
  });
});
