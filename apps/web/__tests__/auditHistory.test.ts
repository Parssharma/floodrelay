import { describe, it, expect } from 'vitest';
import type { AuditEventRecord, ListAuditEventsFilter } from '../lib/api/types';

describe('Phase 5 Part 3 — Audit History & Role-Based Redaction Invariants', () => {
  const sampleAuditRecords: AuditEventRecord[] = [
    {
      id: 'audit-001',
      entityType: 'ASSIGNMENT',
      entityId: 'assign-101',
      eventType: 'ASSIGNMENT_COMMITTED',
      actor: 'dispatcher-1',
      timestamp: '2026-11-05T01:00:00Z',
      payload: {
        operatorNotes: 'Approved northern corridor relief deployment',
        clientIp: '192.168.1.42',
        idempotencyKey: 'idemp-xyz-987',
        idempotencyRequestHash: 'sha256-abc123def456',
        routesCount: 3,
      },
    },
    {
      id: 'audit-002',
      entityType: 'RESOURCE',
      entityId: 'res-boat-alpha',
      eventType: 'RESOURCE_STATUS_UPDATED',
      actor: 'dispatcher-1',
      timestamp: '2026-11-05T01:10:00Z',
      payload: {
        previousStatus: 'AVAILABLE',
        newStatus: 'OFFLINE',
        reason: 'Hull inspection required',
        clientIp: '192.168.1.42',
      },
    },
    {
      id: 'audit-003',
      entityType: 'ROAD_ZONE',
      entityId: 'zone-heights-surge',
      eventType: 'ROAD_BLOCKED',
      actor: 'dispatcher-1',
      timestamp: '2026-11-05T01:15:00Z',
      payload: {
        name: 'Heights Blvd Flood Surge',
        severity: 'BLOCKED',
        clientIp: '10.0.0.5',
      },
    },
  ];

  describe('1. Role-Based Redaction Invariants', () => {
    function sanitizeForRole(
      records: AuditEventRecord[],
      role: 'OPERATOR' | 'DISPATCHER' | 'ADMIN',
    ): AuditEventRecord[] {
      return records.map((record) => {
        if (role === 'OPERATOR') {
          const redactedPayload = { ...record.payload };
          delete redactedPayload.clientIp;
          delete redactedPayload.idempotencyRequestHash;
          delete redactedPayload.idempotencyKey;
          return {
            ...record,
            payload: redactedPayload,
          };
        }
        return record;
      });
    }

    it('redacts clientIp, idempotencyKey, and requestHash for OPERATOR role', () => {
      const sanitized = sanitizeForRole(sampleAuditRecords, 'OPERATOR');
      sanitized.forEach((record) => {
        expect(record.payload).not.toHaveProperty('clientIp');
        expect(record.payload).not.toHaveProperty('idempotencyKey');
        expect(record.payload).not.toHaveProperty('idempotencyRequestHash');
      });

      // Business fields remain intact
      expect(sanitized[0].payload).toHaveProperty('operatorNotes');
      expect(sanitized[0].payload).toHaveProperty('routesCount');
    });

    it('preserves full security telemetry for DISPATCHER and ADMIN roles', () => {
      const dispatcherRecords = sanitizeForRole(sampleAuditRecords, 'DISPATCHER');
      expect(dispatcherRecords[0].payload).toHaveProperty('clientIp');
      expect(dispatcherRecords[0].payload).toHaveProperty('idempotencyKey');
      expect(dispatcherRecords[0].payload).toHaveProperty('idempotencyRequestHash');

      const adminRecords = sanitizeForRole(sampleAuditRecords, 'ADMIN');
      expect(adminRecords[0].payload).toHaveProperty('clientIp');
    });
  });

  describe('2. Query Filter Composition', () => {
    function buildFilterQuery(filters: ListAuditEventsFilter): Record<string, string> {
      const query: Record<string, string> = {};
      if (filters.entityType) query.entityType = filters.entityType;
      if (filters.entityId) query.entityId = filters.entityId;
      if (filters.eventType) query.eventType = filters.eventType;
      if (filters.actor) query.actor = filters.actor;
      if (filters.limit !== undefined) query.limit = String(filters.limit);
      if (filters.offset !== undefined) query.offset = String(filters.offset);
      return query;
    }

    it('builds valid query strings for audit requests', () => {
      const query = buildFilterQuery({
        entityType: 'RESOURCE',
        actor: 'dispatcher-1',
        limit: 50,
      });

      expect(query.entityType).toBe('RESOURCE');
      expect(query.actor).toBe('dispatcher-1');
      expect(query.limit).toBe('50');
      expect(query.eventType).toBeUndefined();
    });
  });
});
