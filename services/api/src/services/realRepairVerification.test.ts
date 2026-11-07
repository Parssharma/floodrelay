import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { getPool } from '../db/connection.js';
import { PostgisRepository } from '../db/repository.js';
import { AuthService } from './authService.js';
import type { DbAssignmentStop } from '../db/schema.js';
// Import the shared load-test repair classifier to verify contract consistency
import { classifyRepairOutcome } from '../../../../tests/load/helpers/repairClassifier.js';

const requireDb = Boolean(
  process.env.REQUIRE_DB && process.env.REQUIRE_DB !== '0' && process.env.REQUIRE_DB !== 'false',
);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const shouldRun = requireDb || hasDatabaseUrl;

describe.runIf(shouldRun)(
  'Real Seeded Repair Integration & Classification Verification (Correction 3)',
  () => {
    let app: Express;
    let repo: PostgisRepository;
    let authService: AuthService;
    let dispatcherToken: string;

    beforeAll(async () => {
      const pool = getPool();
      repo = new PostgisRepository(pool);
      authService = new AuthService(repo);
      app = createApp({ repository: repo, authService });

      // Clean test tables to ensure isolation
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM audit_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query("DELETE FROM operational_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query(
          "DELETE FROM assignment_stops WHERE assignment_id LIKE 'real-repair-%' OR assignment_id LIKE 'prop-repair-%'",
        );
        await client.query(
          "DELETE FROM assignments WHERE id LIKE 'real-repair-%' OR id LIKE 'prop-repair-%'",
        );
        await client.query("DELETE FROM requests WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM resources WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM shelters WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM operator_sessions WHERE token LIKE 'real-tok-%'");
        await client.query("DELETE FROM operators WHERE username LIKE 'real_disp_%'");

        // Provision authorized DISPATCHER role with real credentials
        const dOp = await authService.createOperator({
          username: `real_disp_${Date.now()}`,
          name: 'Real Integration Dispatcher',
          role: 'DISPATCHER',
          password: 'SecureTestPassword123!',
        });
        const dLogin = await authService.authenticate(dOp.username, 'SecureTestPassword123!');
        dispatcherToken = dLogin.token;

        // Seed deterministic operational shelters and resources
        await client.query(`
        INSERT INTO shelters (id, name, location, capacity, current_occupancy, source)
        VALUES 
          ('real-repair-shelter-1', 'Real Test Shelter North', ST_SetSRID(ST_MakePoint(77.25, 28.55), 4326), 100, 0, 'SIMULATED')
        ON CONFLICT (id) DO NOTHING;
      `);

        await client.query(`
        INSERT INTO resources (id, name, type, capacity, speed_km_h, status, location, source)
        VALUES 
          ('real-repair-boat-1', 'Real Alpha Rescue Boat', 'BOAT', 6, 30, 'AVAILABLE', ST_SetSRID(ST_MakePoint(77.20, 28.50), 4326), 'SIMULATED')
        ON CONFLICT (id) DO UPDATE SET status = 'AVAILABLE';
      `);
      } finally {
        client.release();
      }
    });

    beforeEach(async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM audit_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query("DELETE FROM operational_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query(
          "DELETE FROM assignment_stops WHERE assignment_id LIKE 'real-repair-%' OR assignment_id LIKE 'prop-repair-%'",
        );
        await client.query(
          "DELETE FROM assignments WHERE id LIKE 'real-repair-%' OR id LIKE 'prop-repair-%'",
        );
        await client.query("DELETE FROM requests WHERE id LIKE 'real-repair-%'");
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM audit_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query("DELETE FROM operational_events WHERE entity_id LIKE 'real-repair-%'");
        await client.query(
          "DELETE FROM assignment_stops WHERE assignment_id LIKE 'real-repair-%' OR assignment_id LIKE 'prop-repair-%'",
        );
        await client.query(
          "DELETE FROM assignments WHERE id LIKE 'real-repair-%' OR id LIKE 'prop-repair-%'",
        );
        await client.query("DELETE FROM requests WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM resources WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM shelters WHERE id LIKE 'real-repair-%'");
        await client.query("DELETE FROM operator_sessions WHERE token LIKE 'real-tok-%'");
        await client.query("DELETE FROM operators WHERE username LIKE 'real_disp_%'");
      } finally {
        client.release();
      }
    });

    it('executes real solver-backed repair end-to-end, persists PROPOSED plan without auto-commit, and verifies classification', async () => {
      const testReqId = `real-repair-req-${Date.now()}`;
      const testEventId = `real-repair-evt-${Date.now()}`;

      // 1. Seed deterministic, repairable operational request in PostgreSQL
      await repo.insertRequest(
        {
          id: testReqId,
          lat: 28.52,
          lng: 77.22,
          peopleCount: 2,
          urgency: 'HIGH',
          source: 'SIMULATED',
          createdAt: new Date().toISOString(),
        },
        { verificationStatus: 'VERIFIED' },
      );

      // 2. Record operational event (REQUEST_CREATED) in database
      await repo.insertOperationalEvent({
        id: testEventId,
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: testReqId,
        actorId: null,
        actorType: 'CITIZEN',
        payload: { id: testReqId, urgency: 'HIGH', peopleCount: 2 },
        occurredAt: new Date().toISOString(),
      });

      // 3. Call the REAL POST /operations/repair API using authorized credentials (NO MOCKED SOLVER)
      const repairHttpRes = await request(app)
        .post('/operations/repair')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ eventId: testEventId })
        .expect(200);

      expect(repairHttpRes.body.success).toBe(true);
      const repairData = repairHttpRes.body.data;
      expect(repairData.status).toBe('PROPOSED');
      expect(repairData.proposalId).toBeDefined();
      expect(repairData.proposalId).toMatch(/^prop-repair-/);
      expect(repairData.churn).toBeDefined();
      expect(repairData.hasFrozenViolations).toBeFalsy();

      const proposalId = repairData.proposalId;

      // 4. Retrieve proposal from authoritative GET /assignments/:id API
      const verifyHttpRes = await request(app)
        .get(`/assignments/${encodeURIComponent(proposalId)}`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(200);

      expect(verifyHttpRes.body.success).toBe(true);
      expect(verifyHttpRes.body.data.id).toBe(proposalId);
      expect(verifyHttpRes.body.data.status).toBe('PROPOSED');

      // 5. Verify outcome classification using pure load-test classifier
      const classification = classifyRepairOutcome(
        { status: 200, body: JSON.stringify(repairHttpRes.body) },
        { status: 200, body: JSON.stringify(verifyHttpRes.body) },
      );

      expect(classification.category).toBe('PROPOSED_VERIFIED');
      expect(classification.proposalId).toBe(proposalId);
      expect(classification.isFrozenPreserved).toBe(true);
      expect(classification.isUncommitted).toBe(true);

      // 6. Direct PostgreSQL Invariant Validation:
      //    A. Proposal exists with status PROPOSED
      //    B. committed_at is NULL (Proves: NO automatic commitment occurred!)
      //    C. Stops exist and match safety constraints
      const pool = getPool();
      const asgnDbRes = await pool.query('SELECT * FROM assignments WHERE id = $1', [proposalId]);
      expect(asgnDbRes.rows.length).toBe(1);
      const dbAsgn = asgnDbRes.rows[0];
      expect(dbAsgn.status).toBe('PROPOSED');
      expect(dbAsgn.committed_at).toBeNull();

      const stopsDbRes = await pool.query(
        'SELECT * FROM assignment_stops WHERE assignment_id = $1 ORDER BY stop_number ASC',
        [proposalId],
      );
      expect(stopsDbRes.rows.length).toBeGreaterThanOrEqual(2); // At least pickup + dropoff
      const stops = stopsDbRes.rows;
      const pickupStop = stops.find((s) => s.type === 'PICKUP' && s.target_id === testReqId);
      expect(pickupStop).toBeDefined();
      expect(pickupStop.passengers_picked_up).toBe(2);

      // 7. Verify audit event was logged in audit_events table
      const auditRes = await pool.query(
        "SELECT * FROM audit_events WHERE entity_id = $1 AND event_type = 'REPAIR_PROPOSAL_GENERATED'",
        [proposalId],
      );
      expect(auditRes.rows.length).toBe(1);
    });

    it('verifies that committed frozen stops are preserved during incremental repair of a new event', async () => {
      const baseAssignId = `real-repair-base-${Date.now()}`;
      const reqFrozenId = `real-repair-frozen-${Date.now()}`;
      const reqNewId = `real-repair-new-${Date.now()}`;
      const eventId = `real-repair-evt-frozen-${Date.now()}`;

      // Seed frozen request and new request
      await repo.insertRequest(
        {
          id: reqFrozenId,
          lat: 28.51,
          lng: 77.21,
          peopleCount: 2,
          urgency: 'HIGH',
          source: 'SIMULATED',
          createdAt: new Date().toISOString(),
        },
        { verificationStatus: 'VERIFIED' },
      );
      await repo.insertRequest(
        {
          id: reqNewId,
          lat: 28.53,
          lng: 77.23,
          peopleCount: 3,
          urgency: 'HIGH',
          source: 'SIMULATED',
          createdAt: new Date().toISOString(),
        },
        { verificationStatus: 'VERIFIED' },
      );

      // Seed an initial COMMITTED plan with frozen stops
      const stops: DbAssignmentStop[] = [
        {
          id: `real-stop-f-1`,
          assignment_id: baseAssignId,
          resource_id: 'real-repair-boat-1',
          stop_number: 1,
          type: 'PICKUP',
          target_id: reqFrozenId,
          location: 'POINT(77.21 28.51)',
          passengers_picked_up: 2,
          passengers_dropped_off: 0,
          estimated_arrival_minutes: 10,
          is_frozen: true,
          created_at: new Date(),
        },
        {
          id: `real-stop-f-2`,
          assignment_id: baseAssignId,
          resource_id: 'real-repair-boat-1',
          stop_number: 2,
          type: 'DROPOFF',
          target_id: 'real-repair-shelter-1',
          location: 'POINT(77.25 28.55)',
          passengers_picked_up: 0,
          passengers_dropped_off: 2,
          estimated_arrival_minutes: 25,
          is_frozen: true,
          created_at: new Date(),
        },
      ];

      await repo.insertAssignmentWithStops(
        {
          id: baseAssignId,
          scenario_id: 'real-repair-scenario-frozen',
          status: 'COMMITTED',
          metrics: {
            coveragePercent: 100,
            totalTravelTimeMinutes: 25,
            totalTravelDistanceKm: 15,
            highPriorityWaitTimeMinutes: 10,
            solveDurationMs: 5,
            servedRequestsCount: 1,
            unservedRequestsCount: 0,
          },
          unserved: [],
          committed_at: new Date(),
          committed_by: 'ADMIN',
          created_at: new Date(),
          updated_at: new Date(),
        },
        stops,
      );

      // Record new event
      await repo.insertOperationalEvent({
        id: eventId,
        type: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: reqNewId,
        actorId: null,
        actorType: 'CITIZEN',
        payload: { id: reqNewId, urgency: 'HIGH', peopleCount: 3 },
        occurredAt: new Date().toISOString(),
      });

      // Execute repair
      const repairHttpRes = await request(app)
        .post('/operations/repair')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ eventId })
        .expect(200);

      expect(repairHttpRes.body.success).toBe(true);
      const proposalId = repairHttpRes.body.data.proposalId;
      expect(proposalId).toBeDefined();

      // Verify persisted stops in database incorporate frozen stops exactly
      const pool = getPool();
      const proposedStopsRes = await pool.query(
        'SELECT * FROM assignment_stops WHERE assignment_id = $1 ORDER BY stop_number ASC',
        [proposalId],
      );

      const proposedStops = proposedStopsRes.rows;
      // Frozen stops from the committed plan must be preserved
      const frozenPickups = proposedStops.filter(
        (s) => s.type === 'PICKUP' && s.target_id === reqFrozenId,
      );
      expect(frozenPickups.length).toBe(1);
      expect(frozenPickups[0].passengers_picked_up).toBe(2);

      // New pickup must also be incorporated
      const newPickups = proposedStops.filter(
        (s) => s.type === 'PICKUP' && s.target_id === reqNewId,
      );
      expect(newPickups.length).toBe(1);
      expect(newPickups[0].passengers_picked_up).toBe(3);

      // Classification confirms proposal is verified, uncommitted, and preserves frozen stops
      const verifyHttpRes = await request(app)
        .get(`/assignments/${encodeURIComponent(proposalId)}`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(200);

      const classification = classifyRepairOutcome(
        { status: 200, body: JSON.stringify(repairHttpRes.body) },
        { status: 200, body: JSON.stringify(verifyHttpRes.body) },
      );

      expect(classification.category).toBe('PROPOSED_VERIFIED');
      expect(classification.isFrozenPreserved).toBe(true);
      expect(classification.isUncommitted).toBe(true);
    });
  },
);
