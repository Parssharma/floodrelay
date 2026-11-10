import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FloodRelayApiClient } from '../lib/api/client';
import { ApiClientError } from '../lib/api/errors';

export function validateMockAgainstOpenApiSchema(
  schemaName: string,
  mockObj: Record<string, unknown>,
): void {
  const filePath = path.resolve(__dirname, '../../../services/api/src/openapi.json');
  const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let schema = spec.components?.schemas?.[schemaName];
  if (!schema) {
    throw new Error(`Schema ${schemaName} not found in openapi.json`);
  }
  if (schema.$ref) {
    const refKey = schema.$ref.replace('#/components/schemas/', '');
    schema = spec.components?.schemas?.[refKey];
  }
  const requiredFields: string[] = schema?.required || [];
  for (const field of requiredFields) {
    if (mockObj[field] === undefined) {
      throw new Error(`Mock object for ${schemaName} is missing required property: "${field}"`);
    }
  }
}

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
      algorithm: 'savings',
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

  it('fetches affected scope for an operational event and resolves directly to AffectedScopeResult', async () => {
    const mockEvent = {
      id: 'evt-1',
      type: 'REQUEST_CREATED',
      entityType: 'REQUEST',
      entityId: 'req-1',
      actorType: 'CITIZEN',
      occurredAt: '2026-11-10T06:00:00.000Z',
      recordedAt: '2026-11-10T06:00:01.000Z',
      payload: { peopleCount: 2 },
    };

    const mockScope = {
      eventId: 'evt-1',
      affectedRequestIds: ['req-1'],
      affectedResourceIds: ['res-1'],
      affectedProposedAssignmentIds: ['prop-1'],
      committedAssignmentsRequiringReview: ['assign-1'],
      reason: 'Critical request awaiting route assignment',
      repairEligible: true,
    };

    validateMockAgainstOpenApiSchema('OperationalEvent', mockEvent);
    validateMockAgainstOpenApiSchema('AffectedScopeResult', mockScope);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          event: mockEvent,
          affectedScope: mockScope,
        },
      }),
    });

    const res = await client.getAffectedScope('evt-1');
    expect(res.eventId).toBe('evt-1');
    expect(res.affectedRequestIds).toEqual(['req-1']);
    expect(res.affectedResourceIds).toEqual(['res-1']);
    expect(res.affectedProposedAssignmentIds).toEqual(['prop-1']);
    expect(res.committedAssignmentsRequiringReview).toEqual(['assign-1']);
    expect(res.reason).toBe('Critical request awaiting route assignment');
    expect(res.repairEligible).toBe(true);
  });
});
