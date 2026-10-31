import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { AuthService, InMemoryAuthRepository } from '../services/authService.js';
import { PostgisRepository, type Queryable } from '../db/repository.js';
import { RequestService } from '../services/requestService.js';
import { AssignmentService } from '../services/assignmentService.js';
import type { DbRequest } from '../db/schema.js';

class MockQueryable implements Queryable {
  public requests = new Map<string, DbRequest>();

  async query<R extends Record<string, unknown> = Record<string, unknown>>(
    sqlOrConfig: string | { text: string; values?: unknown[] },
    values?: unknown[],
  ): Promise<{ rows: R[]; command: string; rowCount: number; oid: number; fields: [] }> {
    const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
    const vals = values ?? (sqlOrConfig as { values?: unknown[] }).values ?? [];

    if (sql.includes('INSERT INTO requests')) {
      const id = vals[0] as string;
      const req: DbRequest = {
        id,
        location: `POINT(${vals[1]} ${vals[2]})`,
        people_count: vals[3] as number,
        urgency: vals[4] as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        source: 'REPORTED',
        status: 'PENDING',
        verification_status: 'UNVERIFIED',
        medical_needs: Boolean(vals[8]),
        notes: (vals[9] as string) || null,
        idempotency_key: (vals[10] as string) || null,
        idempotency_request_hash: (vals[11] as string) || null,
        duplicate_of_id: (vals[12] as string) || null,
        is_flagged_duplicate: Boolean(vals[13]),
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.requests.set(id, req);
      return { rows: [req as unknown as R], command: 'INSERT', rowCount: 1, oid: 0, fields: [] };
    }

    if (sql.includes('SELECT') && sql.includes('FROM requests') && sql.includes('WHERE id = $1')) {
      const id = vals[0] as string;
      const req = this.requests.get(id);
      return {
        rows: req ? [req as unknown as R] : [],
        command: 'SELECT',
        rowCount: req ? 1 : 0,
        oid: 0,
        fields: [],
      };
    }

    if (sql.includes('SELECT') && sql.includes('FROM requests')) {
      return {
        rows: Array.from(this.requests.values()) as unknown as R[],
        command: 'SELECT',
        rowCount: this.requests.size,
        oid: 0,
        fields: [],
      };
    }

    return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] };
  }
}

describe('Operator Authentication & API Protection Suite', () => {
  let inMemoryAuthRepo: InMemoryAuthRepository;
  let authService: AuthService;
  let mockDb: MockQueryable;
  let repo: PostgisRepository;
  let requestService: RequestService;
  let assignmentService: AssignmentService;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    inMemoryAuthRepo = new InMemoryAuthRepository();
    authService = new AuthService(inMemoryAuthRepo);
    mockDb = new MockQueryable();
    repo = new PostgisRepository(mockDb as unknown as import('pg').Pool);
    requestService = new RequestService(repo);
    assignmentService = new AssignmentService(repo);

    // Create a known operator
    await authService.createOperator({
      username: 'eoc_test_operator',
      password: 'SecureOperatorPassword123!',
      name: 'Capt. R. Vance',
      role: 'OPERATOR',
    });

    app = createApp({
      repository: repo,
      authService,
      requestService,
      assignmentService,
    });
  });

  describe('POST /auth/login', () => {
    it('rejects login with missing username or password', async () => {
      const res = await request(app).post('/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects login with non-existent operator', async () => {
      const res = await request(app).post('/auth/login').send({
        username: 'unknown_operator',
        password: 'Password123!',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects login with incorrect password', async () => {
      const res = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'WrongPassword456!',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('successfully logs in with valid credentials and sets session cookie', async () => {
      const res = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.operator.username).toBe('eoc_test_operator');
      expect(res.body.data.operator.name).toBe('Capt. R. Vance');

      // Verify Set-Cookie header
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(';') : String(cookies);
      expect(cookieStr).toContain('floodrelay_session=');
      expect(cookieStr).toContain('HttpOnly');
    });

    it('enforces rate limiting after 5 consecutive failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const failRes = await request(app).post('/auth/login').send({
          username: 'eoc_test_operator',
          password: 'IncorrectPassword',
        });
        expect(failRes.status).toBe(401);
      }

      // 6th attempt should be blocked by rate limiter
      const lockedRes = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!', // Even with correct password
      });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('GET /auth/me & Session Verification', () => {
    it('returns 401 UNAUTHORIZED when no token or cookie is supplied', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 SESSION_EXPIRED when an invalid token is provided', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set(
          'Authorization',
          'Bearer 0000000000000000000000000000000000000000000000000000000000000000',
        );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('returns operator profile when authenticated via Bearer token', async () => {
      const loginRes = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!',
      });
      const token = loginRes.body.data.token;

      const meRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.operator.username).toBe('eoc_test_operator');
    });

    it('returns operator profile when authenticated via cookie', async () => {
      const loginRes = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!',
      });
      const cookie = loginRes.headers['set-cookie'] || [];
      const cookieHeader = Array.isArray(cookie) ? cookie : [String(cookie)];

      const meRes = await request(app).get('/auth/me').set('Cookie', cookieHeader);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.operator.username).toBe('eoc_test_operator');
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes session and subsequent requests fail', async () => {
      const loginRes = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!',
      });
      const token = loginRes.body.data.token;

      // Logout
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify session is now invalid
      const meRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(401);
    });
  });

  describe('API Route Protection & Public Boundary Enforcement', () => {
    it('keeps POST /requests (Citizen Portal) open to anonymous callers', async () => {
      const res = await request(app).post('/requests').send({
        lat: 28.6139,
        lng: 77.209,
        peopleCount: 2,
        urgency: 'HIGH',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it('blocks anonymous access to GET /requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/requests');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows authenticated operator access to GET /requests', async () => {
      const loginRes = await request(app).post('/auth/login').send({
        username: 'eoc_test_operator',
        password: 'SecureOperatorPassword123!',
      });
      const token = loginRes.body.data.token;

      const res = await request(app).get('/requests').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('blocks anonymous access to GET /requests/:id with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/requests/req-sample-id');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('blocks anonymous access to GET /assignments with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/assignments');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('keeps GET /health publicly accessible without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('keeps GET /openapi.json publicly accessible without auth', async () => {
      const res = await request(app).get('/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBeDefined();
    });
  });
});
