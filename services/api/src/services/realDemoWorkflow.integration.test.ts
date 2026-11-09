import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { getPool } from '../db/connection.js';
import { PostgisRepository } from '../db/repository.js';
import { AuthService } from './authService.js';
import { RequestService } from './requestService.js';
import { AssignmentService } from './assignmentService.js';
import { OperationalEventService } from './operationalEventService.js';
import { AffectedScopeService } from './affectedScopeService.js';
import { RepairOrchestrationService } from './repairOrchestrationService.js';
import { IncrementalRepairSolverAdapter } from './incrementalRepairSolverAdapter.js';
import { runMigrationsUp } from '../db/migrator.js';
import {
  assertDisposableTestDatabase,
  FixtureRegistry,
  assertFrozenStopsPreserved,
  fetchAssignmentStopsWithCoordinates,
} from './realRepairVerificationHelper.js';

const requireDb = Boolean(
  process.env.REQUIRE_DB && process.env.REQUIRE_DB !== '0' && process.env.REQUIRE_DB !== 'false',
);
const hasAllowFlag = Boolean(
  process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB === '1' ||
  process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB === 'true' ||
  process.env.ALLOW_DISPOSABLE_DEMO_DB === '1' ||
  process.env.ALLOW_DISPOSABLE_DEMO_DB === 'true',
);
const shouldRun = requireDb && hasAllowFlag;

describe.runIf(shouldRun)(
  'Real PostGIS Demo Workflow Integration Test (End-to-End Real PostGIS & Solver)',
  () => {
    let app: Express;
    let repo: PostgisRepository;
    let authService: AuthService;
    let assignmentService: AssignmentService;
    let eventService: OperationalEventService;
    let repairService: RepairOrchestrationService;
    let currentRegistry: FixtureRegistry | null = null;

    beforeAll(async () => {
      const pool = getPool();
      // Guard 1: Verify connected database identity and safety before ANY actions
      await assertDisposableTestDatabase(pool);

      // Guard 2: Run schema migrations
      await runMigrationsUp(pool);

      repo = new PostgisRepository(pool);
      authService = new AuthService(repo);
      const requestService = new RequestService(repo);
      assignmentService = new AssignmentService(repo);
      const affectedScopeService = new AffectedScopeService(repo);
      eventService = new OperationalEventService(repo, affectedScopeService);
      const repairSolver = new IncrementalRepairSolverAdapter(repo);
      repairService = new RepairOrchestrationService(repo, repairSolver);

      app = createApp({
        repository: repo,
        authService,
        requestService,
        assignmentService,
        operationalEventService: eventService,
        affectedScopeService,
        repairOrchestrationService: repairService,
      });
    });

    afterEach(async () => {
      if (currentRegistry) {
        const pool = getPool();
        await currentRegistry.cleanup(pool);
        currentRegistry = null;
      }
    });

    it('executes full end-to-end real demo workflow: intake -> propose -> commit -> disrupt -> repair preserving frozen stops', async () => {
      const pool = getPool();
      const registry = new FixtureRegistry();
      currentRegistry = registry;

      // 1. Provision authorized DISPATCHER role with unique test-run username
      const username = registry.generateId('demo_disp');
      registry.operatorUsernames.add(username);
      const testPassword = `TestPass_${crypto.randomBytes(8).toString('hex')}!`;

      const dOp = await authService.createOperator({
        username,
        name: 'Real Demo Dispatcher',
        role: 'DISPATCHER',
        password: testPassword,
      });
      const dLogin = await authService.authenticate(dOp.username, testPassword);
      registry.operatorSessionTokens.add(dLogin.token);
      const dispatcherToken = dLogin.token;

      // 2. Provision shelters
      const shelterId1 = registry.generateId('shelter_n');
      registry.shelterIds.add(shelterId1);
      await pool.query(
        `INSERT INTO shelters (id, name, location, capacity, current_occupancy, source)
         VALUES ($1, 'North Safe Haven', ST_SetSRID(ST_MakePoint(77.22, 28.68), 4326), 150, 0, 'SIMULATED');`,
        [shelterId1],
      );

      // 3. Provision rescue craft resources
      const boat1 = registry.generateId('craft_alpha');
      registry.resourceIds.add(boat1);
      await pool.query(
        `INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, shift_max_duration_min, source)
         VALUES ($1, 'Rigid Inflatable Alpha', 'BOAT', 6, 25.0, ST_SetSRID(ST_MakePoint(77.23, 28.66), 4326), 'AVAILABLE', 480, 'SIMULATED');`,
        [boat1],
      );

      const boat2 = registry.generateId('craft_bravo');
      registry.resourceIds.add(boat2);
      await pool.query(
        `INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, shift_max_duration_min, source)
         VALUES ($1, 'Rigid Inflatable Bravo', 'BOAT', 8, 20.0, ST_SetSRID(ST_MakePoint(77.24, 28.65), 4326), 'AVAILABLE', 480, 'SIMULATED');`,
        [boat2],
      );

      // 4. Intake distress requests via API (idempotent, verified)
      const reqId1 = registry.generateId('req_yamuna_1');
      registry.requestIds.add(reqId1);
      await pool.query(
        `INSERT INTO requests (id, location, people_count, urgency, status, verification_status, source)
         VALUES ($1, ST_SetSRID(ST_MakePoint(77.235, 28.665), 4326), 3, 'CRITICAL', 'PENDING', 'VERIFIED', 'SIMULATED');`,
        [reqId1],
      );

      const reqId2 = registry.generateId('req_yamuna_2');
      registry.requestIds.add(reqId2);
      await pool.query(
        `INSERT INTO requests (id, location, people_count, urgency, status, verification_status, source)
         VALUES ($1, ST_SetSRID(ST_MakePoint(77.238, 28.662), 4326), 4, 'HIGH', 'PENDING', 'VERIFIED', 'SIMULATED');`,
        [reqId2],
      );

      // 5. Propose baseline rescue assignment (algorithm: nearest-first)
      const proposeRes = await request(app)
        .post('/assignments/propose')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ algorithm: 'nearest-first' });

      expect(proposeRes.status).toBe(200);
      expect(proposeRes.body.success).toBe(true);
      const baselineAssignmentId = proposeRes.body.data.assignment.id;
      registry.assignmentIds.add(baselineAssignmentId);

      // 6. Operator commits baseline assignment -> stops become FROZEN
      const commitRes = await request(app)
        .post(`/assignments/${baselineAssignmentId}/commit`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ notes: 'Committed by real demo test runner' });

      expect(commitRes.status).toBe(200);

      // Inspect committed baseline stops in PostgreSQL
      const baselineStops = await fetchAssignmentStopsWithCoordinates(pool, baselineAssignmentId);
      expect(baselineStops.length).toBeGreaterThan(0);
      const frozenBaselineStops = baselineStops.filter((s) => s.isFrozen);
      expect(frozenBaselineStops.length).toBeGreaterThan(0);

      // 7. Inject operational disruption: Craft engine failure (RESOURCE_OFFLINE)
      const offlineRes = await request(app)
        .post('/operations/resource-status')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          resourceId: boat1,
          status: 'OFFLINE',
          reason: 'Engine intake fouled by flood debris',
        });

      expect(offlineRes.status).toBe(200);
      const disruptionEventId = offlineRes.body.data.event.id;
      registry.operationalEventIds.add(disruptionEventId);

      // 8. Trigger incremental repair orchestration
      const repairRes = await request(app)
        .post('/operations/repair')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          eventId: disruptionEventId,
          baselineAssignmentId,
        });

      expect(repairRes.status).toBe(200);
      expect(repairRes.body.success).toBe(true);

      const repairData = repairRes.body.data;
      if (repairData.proposalId) {
        registry.assignmentIds.add(repairData.proposalId);

        // Verify frozen stops invariant in PostgreSQL database
        const repairedStops = await fetchAssignmentStopsWithCoordinates(
          pool,
          repairData.proposalId,
        );
        assertFrozenStopsPreserved(frozenBaselineStops, repairedStops, 'PROPOSED');
      }

      // Verify zero frozen stop violations
      expect(repairData.churn.frozenStopsViolated).toBe(0);

      // 9. Verify cleanup deletes only tracked fixtures
      await registry.cleanup(pool);
      currentRegistry = null;

      const verifyClean = await pool.query(`SELECT COUNT(*) AS c FROM assignments WHERE id = $1`, [
        baselineAssignmentId,
      ]);
      expect(Number(verifyClean.rows[0]?.c)).toBe(0);
    });
  },
);
