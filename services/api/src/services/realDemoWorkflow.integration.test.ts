import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { type Scenario, type SolverPlan } from '@floodrelay/shared';
import { solveNearestFirst, validateSolverPlan } from '@floodrelay/solver';
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
import { ForecastService } from './floodForecast/forecastService.js';
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
    let forecastService: ForecastService;
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
      forecastService = new ForecastService();

      app = createApp({
        repository: repo,
        authService,
        requestService,
        assignmentService,
        operationalEventService: eventService,
        affectedScopeService,
        repairOrchestrationService: repairService,
        forecastService,
      });
    });

    afterEach(async () => {
      if (currentRegistry) {
        const pool = getPool();
        await currentRegistry.cleanup(pool);
        currentRegistry = null;
      }
    });

    it('executes full 8-stage disaster response scenario on real PostGIS with invariant verification', async () => {
      const pool = getPool();
      const registry = new FixtureRegistry();
      currentRegistry = registry;

      // Provision authorized DISPATCHER role with unique test-run username
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

      // Provision shelters
      const shelterId1 = registry.generateId('shelter_n');
      registry.shelterIds.add(shelterId1);
      await pool.query(
        `INSERT INTO shelters (id, name, location, capacity, current_occupancy, source)
         VALUES ($1, 'North Safe Haven', ST_SetSRID(ST_MakePoint(77.22, 28.68), 4326), 150, 0, 'REAL');`,
        [shelterId1],
      );

      // Provision rescue craft resources
      const boat1 = registry.generateId('craft_alpha');
      registry.resourceIds.add(boat1);
      await pool.query(
        `INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, shift_max_duration_min, source)
         VALUES ($1, 'Rigid Inflatable Alpha', 'BOAT', 10, 25.0, ST_SetSRID(ST_MakePoint(77.23, 28.66), 4326), 'AVAILABLE', 480, 'REAL');`,
        [boat1],
      );

      const boat2 = registry.generateId('craft_bravo');
      registry.resourceIds.add(boat2);
      await pool.query(
        `INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, shift_max_duration_min, source)
         VALUES ($1, 'Rigid Inflatable Bravo', 'BOAT', 8, 20.0, ST_SetSRID(ST_MakePoint(77.24, 28.65), 4326), 'AVAILABLE', 480, 'REAL');`,
        [boat2],
      );

      const boat3 = registry.generateId('craft_charlie');
      registry.resourceIds.add(boat3);
      await pool.query(
        `INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, shift_max_duration_min, source)
         VALUES ($1, 'Rigid Inflatable Charlie', 'BOAT', 4, 25.0, ST_SetSRID(ST_MakePoint(77.25, 28.64), 4326), 'AVAILABLE', 480, 'REAL');`,
        [boat3],
      );

      // =========================================================================
      // Stage 1: Citizen intake with geospatial duplicate flagging (<= 100m, <= 2h) without deletion
      // =========================================================================
      const intakeRes1 = await request(app).post('/requests').send({
        lat: 28.665,
        lng: 77.235,
        peopleCount: 3,
        urgency: 'CRITICAL',
        source: 'REPORTED',
        verificationStatus: 'VERIFIED',
        notes: 'Citizen distress request 1: Family stranded on roof',
      });
      expect(intakeRes1.status).toBe(201);
      expect(intakeRes1.body.success).toBe(true);
      const req1Id = intakeRes1.body.data.id;
      registry.requestIds.add(req1Id);
      expect(intakeRes1.body.data.isFlaggedDuplicate).toBe(false);

      // Request 2: Geospatial duplicate near request 1 (~25m away within 2h) -> Flagged without deletion
      const intakeRes2 = await request(app).post('/requests').send({
        lat: 28.6652,
        lng: 77.2351,
        peopleCount: 2,
        urgency: 'CRITICAL',
        source: 'REPORTED',
        verificationStatus: 'UNVERIFIED',
        notes: 'Neighbor reporting same building family stranded',
      });
      expect(intakeRes2.status).toBe(201);
      expect(intakeRes2.body.success).toBe(true);
      const req2Id = intakeRes2.body.data.id;
      registry.requestIds.add(req2Id);
      expect(intakeRes2.body.data.isFlaggedDuplicate).toBe(true);
      expect(intakeRes2.body.data.duplicateOfId).toBe(req1Id);

      // Request 3: Distinct distress location
      const intakeRes3 = await request(app).post('/requests').send({
        lat: 28.662,
        lng: 77.238,
        peopleCount: 4,
        urgency: 'HIGH',
        source: 'REPORTED',
        verificationStatus: 'VERIFIED',
        notes: 'Citizen distress request 3: Medical urgency at community center',
      });
      expect(intakeRes3.status).toBe(201);
      expect(intakeRes3.body.success).toBe(true);
      const req3Id = intakeRes3.body.data.id;
      registry.requestIds.add(req3Id);

      // =========================================================================
      // Stage 2: Operator request monitoring and triage
      // =========================================================================
      const listReqsRes = await request(app)
        .get('/requests?status=PENDING')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(listReqsRes.status).toBe(200);
      expect(listReqsRes.body.success).toBe(true);
      const returnedIds = (listReqsRes.body.data as Array<{ id: string }>).map((r) => r.id);
      expect(returnedIds).toContain(req1Id);
      expect(returnedIds).toContain(req2Id);
      expect(returnedIds).toContain(req3Id);

      // =========================================================================
      // Stage 3: Algorithmic proposal generation (capacity constraints, pickup before dropoff)
      // =========================================================================
      const proposeRes = await request(app)
        .post('/assignments/propose')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ algorithm: 'nearest-first' });

      expect(proposeRes.status).toBe(201);
      expect(proposeRes.body.success).toBe(true);
      const baselineAssignmentId = proposeRes.body.data.id;
      expect(baselineAssignmentId).toBeDefined();
      registry.trackAssignment(baselineAssignmentId);

      const proposedPlan = proposeRes.body.data;
      expect(proposedPlan.status).toBe('PROPOSED');
      expect(proposedPlan.routes.length).toBeGreaterThan(0);
      for (const route of proposedPlan.routes) {
        let currentLoad = 0;
        let prevArrival = 0;
        const pickedUpRequests = new Set<string>();
        const onboardRequests = new Set<string>();

        expect(route.stops.length).toBeGreaterThan(0);

        for (const stop of route.stops) {
          // Invariant 1: Monotonic arrival times along route
          expect(stop.estimatedArrivalMinutes).toBeGreaterThanOrEqual(prevArrival);
          prevArrival = stop.estimatedArrivalMinutes;

          if (stop.type === 'PICKUP') {
            // Invariant 2: Pickups must be non-empty and unique per request
            expect(stop.passengersPickedUp).toBeGreaterThan(0);
            expect(pickedUpRequests.has(stop.targetId)).toBe(false);
            pickedUpRequests.add(stop.targetId);
            onboardRequests.add(stop.targetId);

            currentLoad += stop.passengersPickedUp;
            // Invariant 3: Capacity upper bound along route
            expect(currentLoad).toBeLessThanOrEqual(10);
          } else if (stop.type === 'DROPOFF') {
            // Invariant 4: Delivery precedence — delivery occurs after its corresponding pickup;
            // cannot deliver more passengers than currently onboard
            expect(stop.passengersDroppedOff).toBeGreaterThan(0);
            expect(stop.passengersDroppedOff).toBeLessThanOrEqual(currentLoad);

            currentLoad -= stop.passengersDroppedOff;
            // Invariant 5: Non-negative load
            expect(currentLoad).toBeGreaterThanOrEqual(0);

            // When currentLoad reaches 0, all onboard requests have been safely delivered to shelter
            if (currentLoad === 0) {
              onboardRequests.clear();
            }
          }
        }

        // Invariant 6: Must drop off all onboard passengers before route end
        expect(currentLoad).toBe(0);
        expect(onboardRequests.size).toBe(0);

        // Invariant 7: Route must end with a DROPOFF at a valid shelter
        const lastStop = route.stops[route.stops.length - 1]!;
        expect(lastStop.type).toBe('DROPOFF');
        expect(typeof lastStop.targetId).toBe('string');
        expect(lastStop.targetId.length).toBeGreaterThan(0);
      }

      // =========================================================================
      // Stage 4: Human operator commitment with frozen stops & invalid commitment rollback
      // =========================================================================
      const invalidCommit = await request(app)
        .post('/assignments/non-existent-assign-id/commit')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ operatorId: username });
      expect([404, 409]).toContain(invalidCommit.status);

      const commitRes = await request(app)
        .post(`/assignments/${baselineAssignmentId}/commit`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          operatorId: username,
          notes: 'Authoritative baseline commitment by real demo test runner',
        });

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.success).toBe(true);

      const baselineStops = await fetchAssignmentStopsWithCoordinates(pool, baselineAssignmentId);
      expect(baselineStops.length).toBeGreaterThan(0);
      const frozenBaselineStops = baselineStops.filter((s) => s.isFrozen);
      expect(frozenBaselineStops.length).toBeGreaterThan(0);

      // Assert committed requests are ASSIGNED in database
      const reqRows = await pool.query<{ id: string; status: string }>(
        'SELECT id, status FROM requests WHERE id = ANY($1::text[])',
        [[req1Id, req3Id]],
      );
      for (const row of reqRows.rows) {
        expect(row.status).toBe('ASSIGNED');
      }

      // =========================================================================
      // Stage 5: Disruption events: craft failure (RESOURCE_OFFLINE) & road blockage (ROAD_BLOCKED)
      // =========================================================================
      const statusRes = await request(app)
        .patch(`/operations/resources/${boat3}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'MAINTENANCE',
          reason: 'Routine propeller maintenance',
        });
      if (statusRes.body?.data?.event?.id) {
        registry.operationalEventIds.add(statusRes.body.data.event.id);
      }
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);

      const roadZoneRes = await request(app)
        .post('/operations/road-zones')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          name: 'Yamuna Marginal Embankment Breach Zone',
          severity: 'BLOCKED',
          polygon: [
            { lat: 28.69, lng: 77.21 },
            { lat: 28.69, lng: 77.218 },
            { lat: 28.696, lng: 77.218 },
            { lat: 28.696, lng: 77.21 },
          ],
          reason: 'Embankment breached by rising flood surge',
        });
      if (roadZoneRes.body?.data?.zone?.id) {
        registry.blockedZoneIds.add(roadZoneRes.body.data.zone.id);
      }
      if (roadZoneRes.body?.data?.event?.id) {
        registry.operationalEventIds.add(roadZoneRes.body.data.event.id);
      }
      expect(roadZoneRes.status).toBe(201);
      expect(roadZoneRes.body.success).toBe(true);
      const roadDisruptionEventId = roadZoneRes.body.data.event.id;

      // =========================================================================
      // Stage 6: Incremental repair producing proposal preserving frozen stops
      // =========================================================================
      const repairRes = await request(app)
        .post('/operations/repair')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          eventId: roadDisruptionEventId,
          baselineAssignmentId,
        });

      expect(repairRes.status).toBe(200);
      expect(repairRes.body.success).toBe(true);

      const repairData = repairRes.body.data;
      expect(
        repairData.status,
        `Repair proposal failed: ${JSON.stringify(repairData.warnings)}`,
      ).toBe('PROPOSED');
      expect(typeof repairData.proposalId).toBe('string');
      registry.trackAssignment(repairData.proposalId);

      // Verify frozen stops invariant in PostgreSQL database
      const repairedStops = await fetchAssignmentStopsWithCoordinates(pool, repairData.proposalId);
      assertFrozenStopsPreserved(frozenBaselineStops, repairedStops, 'PROPOSED');
      expect(repairData.churn.frozenStopsViolated).toBe(0);

      // =========================================================================
      // Stage 7: Forecast context retrieval (GET /forecast/context)
      // =========================================================================
      const forecastRes = await request(app)
        .get('/forecast/context?lat=28.65&lng=77.23&days=7')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(forecastRes.status).toBe(200);
      expect(forecastRes.body.success).toBe(true);
      expect(forecastRes.body.data.variable.name).toBe('river_discharge');
      expect(forecastRes.body.data.disclaimer).toBeDefined();

      // =========================================================================
      // Stage 8: Operational audit history & foreign-key safe teardown
      // =========================================================================
      const auditRes = await request(app)
        .get('/audit/events?limit=50')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.success).toBe(true);
      expect(Array.isArray(auditRes.body.data)).toBe(true);

      // Teardown: delete only tracked fixtures in foreign-key-safe order
      await registry.cleanup(pool);
      currentRegistry = null;

      const verifyBaseline = await pool.query(
        'SELECT COUNT(*) AS c FROM assignments WHERE id = $1',
        [baselineAssignmentId],
      );
      expect(Number(verifyBaseline.rows[0]?.c)).toBe(0);

      const verifyRepair = await pool.query('SELECT COUNT(*) AS c FROM assignments WHERE id = $1', [
        repairData.proposalId,
      ]);
      expect(Number(verifyRepair.rows[0]?.c)).toBe(0);

      const verifyReqs = await pool.query(
        'SELECT COUNT(*) AS c FROM requests WHERE id = ANY($1::text[])',
        [[req1Id, req2Id, req3Id]],
      );
      expect(Number(verifyReqs.rows[0]?.c)).toBe(0);
    });

    it('verifies that multi-trip routes with interleaved independent pickup-delivery pairs satisfy all route invariants (Rule B regression)', () => {
      // Scenario: Vehicle with capacity 6 serves two distinct requests:
      // Request A (4 people) and Request B (5 people).
      // Combined load (4 + 5 = 9) exceeds vehicle capacity (6), requiring two separate sorties:
      // Sortie 1: PICKUP(reqA, 4) -> DROPOFF(shelter, 4)
      // Sortie 2: PICKUP(reqB, 5) -> DROPOFF(shelter, 5)
      // This test proves that PICKUP occurring after DROPOFF across independent sorties
      // is completely valid and correctly satisfies delivery precedence, capacity, and route completion.
      const interleavedScenario: Scenario = {
        id: 'scenario-multi-trip-regression',
        metadata: {
          id: 'scenario-multi-trip-regression',
          name: 'Multi-Trip Regression Scenario',
          region: 'Delhi NCR',
          createdAt: '2026-11-20T00:00:00.000Z',
          bounds: { minLat: 28.6, maxLat: 28.7, minLng: 77.2, maxLng: 77.3 },
        },
        resources: [
          {
            id: 'craft_multi_trip',
            name: 'Rescue Craft Multi',
            type: 'BOAT',
            capacity: 6,
            speedKmH: 25.0,
            lat: 28.66,
            lng: 77.23,
            status: 'AVAILABLE',
            source: 'REAL',
          },
        ],
        shelters: [
          {
            id: 'shelter_regression',
            name: 'Safe Haven Regression',
            lat: 28.68,
            lng: 77.22,
            capacity: 150,
            source: 'REAL',
          },
        ],
        requests: [
          {
            id: 'req_group_a',
            lat: 28.665,
            lng: 77.235,
            peopleCount: 4,
            urgency: 'HIGH',
            status: 'PENDING',
            source: 'REPORTED',
            createdAt: '2026-11-20T00:00:00.000Z',
          },
          {
            id: 'req_group_b',
            lat: 28.668,
            lng: 77.238,
            peopleCount: 5,
            urgency: 'HIGH',
            status: 'PENDING',
            source: 'REPORTED',
            createdAt: '2026-11-20T00:00:00.000Z',
          },
        ],
      };

      // Solve with nearest-first which generates multi-trip sorties when capacity is reached
      const plan = solveNearestFirst(interleavedScenario);

      expect(plan.routes).toHaveLength(1);
      const multiRoute = plan.routes[0]!;
      expect(multiRoute.stops.length).toBe(4);

      // Verify exact stop structure:
      // Stop 1: PICKUP req_group_a (4 passengers)
      // Stop 2: DROPOFF shelter_regression (4 passengers dropped off)
      // Stop 3: PICKUP req_group_b (5 passengers picked up) -- PICKUP after DROPOFF is valid under Rule B!
      // Stop 4: DROPOFF shelter_regression (5 passengers dropped off)
      expect(multiRoute.stops[0]?.type).toBe('PICKUP');
      expect(multiRoute.stops[0]?.targetId).toBe('req_group_a');
      expect(multiRoute.stops[0]?.passengersPickedUp).toBe(4);

      expect(multiRoute.stops[1]?.type).toBe('DROPOFF');
      expect(multiRoute.stops[1]?.targetId).toBe('shelter_regression');
      expect(multiRoute.stops[1]?.passengersDroppedOff).toBe(4);

      expect(multiRoute.stops[2]?.type).toBe('PICKUP');
      expect(multiRoute.stops[2]?.targetId).toBe('req_group_b');
      expect(multiRoute.stops[2]?.passengersPickedUp).toBe(5);

      expect(multiRoute.stops[3]?.type).toBe('DROPOFF');
      expect(multiRoute.stops[3]?.targetId).toBe('shelter_regression');
      expect(multiRoute.stops[3]?.passengersDroppedOff).toBe(5);

      // Validate against the canonical solver plan validator
      const validationResult = validateSolverPlan(interleavedScenario, plan);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Negative check: prove that a route where delivery PRECEDES pickup is rejected
      const invalidPrecedencePlan: SolverPlan = {
        ...plan,
        routes: [
          {
            ...multiRoute,
            stops: [
              {
                ...multiRoute.stops[1]!,
                stopNumber: 1,
                passengersDroppedOff: 4, // Dropoff before any pickup occurred!
              },
              ...multiRoute.stops.slice(1),
            ],
          },
        ],
      };
      const invalidResult = validateSolverPlan(interleavedScenario, invalidPrecedencePlan);
      expect(invalidResult.valid).toBe(false);
      expect(
        invalidResult.errors.some((e) => e.includes('dropped off') || e.includes('below 0')),
      ).toBe(true);
    });
  },
);
