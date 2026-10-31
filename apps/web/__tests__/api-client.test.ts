import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FloodRelayApiClient } from '../lib/api/client';
import { ApiClientError } from '../lib/api/errors';

describe('FloodRelayApiClient', () => {
  let client: FloodRelayApiClient;

  beforeEach(() => {
    client = new FloodRelayApiClient({ baseUrl: 'http://localhost:3000/api/v1' });
    vi.restoreAllMocks();
  });

  it('checks system health successfully', async () => {
    const mockHealth = {
      status: 'healthy',
      timestamp: '2026-10-31T02:00:00Z',
      database: 'connected',
      version: '0.2.0',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockHealth }),
    });

    const res = await client.getHealth();
    expect(res.status).toBe('healthy');
    expect(res.database).toBe('connected');
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/health', expect.anything());
  });

  it('fetches rescue requests with query filters', async () => {
    const mockRequests = [
      {
        id: 'req_1',
        lat: 29.76,
        lng: -95.36,
        peopleCount: 4,
        urgency: 'CRITICAL',
        status: 'PENDING',
        verificationStatus: 'UNVERIFIED',
        createdAt: '2026-10-31T01:00:00Z',
        updatedAt: '2026-10-31T01:00:00Z',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockRequests }),
    });

    const res = await client.listRequests({ status: 'PENDING', urgency: 'CRITICAL', limit: 10 });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('req_1');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/requests?status=PENDING&urgency=CRITICAL&limit=10',
      expect.anything(),
    );
  });

  it('proposes assignment plans via solver endpoint', async () => {
    const mockProposal = {
      id: 'PR-105',
      status: 'PROPOSED',
      metrics: {
        coveragePercent: 94.2,
        totalTravelTimeMinutes: 48.5,
        totalTravelDistanceKm: 16.4,
        highPriorityWaitTimeMinutes: 14.2,
        solveDurationMs: 42,
        servedRequestsCount: 12,
        unservedRequestsCount: 1,
      },
      createdAt: '2026-10-31T01:45:00Z',
      updatedAt: '2026-10-31T01:48:00Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const res = await client.proposeAssignment({
      algorithm: 'CLARKE_WRIGHT',
      preserveFrozen: true,
    });

    expect(res.id).toBe('PR-105');
    expect(res.status).toBe('PROPOSED');
  });

  it('commits assignment plans with operator ID', async () => {
    const mockCommitted = {
      id: 'PR-105',
      status: 'COMMITTED',
      committedBy: 'Capt. R. Vance',
      committedAt: '2026-10-31T02:00:00Z',
      createdAt: '2026-10-31T01:45:00Z',
      updatedAt: '2026-10-31T02:00:00Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockCommitted }),
    });

    const res = await client.commitAssignment('PR-105', {
      operatorId: 'operator_vance',
      notes: 'Authorized for Sector 4 deployment',
    });

    expect(res.status).toBe('COMMITTED');
    expect(res.committedBy).toBe('Capt. R. Vance');
  });

  it('throws ApiClientError with 404 status when resource is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'NOT_FOUND',
          message: 'Assignment proposal PR-999 not found',
        },
      }),
    });

    await expect(client.getAssignment('PR-999')).rejects.toThrow(ApiClientError);
    await expect(client.getAssignment('PR-999')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws ApiClientError with 409 status on concurrency conflict', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'CONCURRENCY_CONFLICT',
          message: 'Assignment plan is already COMMITTED',
        },
      }),
    });

    await expect(client.commitAssignment('COM-204', { operatorId: 'op_1' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONCURRENCY_CONFLICT',
    });
  });

  it('authenticates operator via login and sets auth token for subsequent requests', async () => {
    const mockLoginResponse = {
      message: 'Operator authenticated successfully',
      token: 'fake-jwt-token-12345',
      operator: {
        id: 'op-001',
        username: 'commander',
        name: 'Sector Commander',
        role: 'COMMANDER',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockLoginResponse }),
    });

    const result = await client.login('commander', 'SecretPass123!');
    expect(result.token).toBe('fake-jwt-token-12345');
    expect(result.operator.username).toBe('commander');
    expect(client.getAuthToken()).toBe('fake-jwt-token-12345');

    // Subsequent requests must carry Authorization header
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          operator: {
            id: 'op-001',
            username: 'commander',
            name: 'Sector Commander',
            role: 'COMMANDER',
          },
        },
      }),
    });

    const me = await client.getMe();
    expect(me.username).toBe('commander');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fake-jwt-token-12345',
        }),
      }),
    );
  });

  it('clears auth token upon operator logout', async () => {
    client.setAuthToken('existing-session-token');
    expect(client.getAuthToken()).toBe('existing-session-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { message: 'Logged out successfully' } }),
    });

    const res = await client.logout();
    expect(res.message).toBe('Logged out successfully');
    expect(client.getAuthToken()).toBeNull();
  });
});
