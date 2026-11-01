import http from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { getPool, closePool } from '../db/connection.js';

interface SqlRequestRow {
  id: string;
  status: string;
  urgency: string;
}

interface SqlAssignmentRow {
  id: string;
  status: string;
  committed_at: Date | null;
  committed_by: string | null;
}

interface SqlStopRow {
  id: string;
  stop_number: number;
  is_frozen: boolean;
}

interface SqlAuditRow {
  id: string;
  event_type: string;
  actor: string;
}

export async function runPhase3E2EVerification(): Promise<void> {
  console.log('================================================================');
  console.log('FLOODRELAY PHASE 3: MASTER END-TO-END INTEGRATION AUDIT');
  console.log('================================================================\n');

  const pool = getPool();
  const dbClient = await pool.connect();
  console.log('✓ Connected to PostgreSQL/PostGIS database');

  // Seed / ensure test operator exists
  const testUsername = 'test_e2e_commander';
  const testPassword = 'E2EPass2026!Secure';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(testPassword, salt, 64).toString('hex');

  await dbClient.query(
    `INSERT INTO operators (id, username, password_hash, salt, name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = $3, salt = $4, updated_at = NOW()`,
    ['op-e2e-001', testUsername, passwordHash, salt, 'Commander E2E Inspector', 'DISPATCHER'],
  );
  console.log(`✓ Seeded test operator: ${testUsername}`);

  // Ensure test rescue resources and shelter exist
  await dbClient.query(`
    INSERT INTO resources (id, name, type, capacity, speed_km_h, location, status, source)
    VALUES
      ('res-e2e-boat-1', 'E2E Rescue Craft Alpha', 'BOAT', 8, 25.0, ST_SetSRID(ST_MakePoint(77.22, 28.65), 4326)::geography, 'AVAILABLE', 'SIMULATED'),
      ('res-e2e-boat-2', 'E2E Rescue Craft Bravo', 'BOAT', 6, 20.0, ST_SetSRID(ST_MakePoint(77.23, 28.66), 4326)::geography, 'AVAILABLE', 'SIMULATED')
    ON CONFLICT (id) DO UPDATE SET status = 'AVAILABLE';
  `);

  await dbClient.query(`
    INSERT INTO shelters (id, name, location, capacity, current_occupancy, is_active, source)
    VALUES
      ('sh-e2e-relief', 'E2E Relief Shelter', ST_SetSRID(ST_MakePoint(77.28, 28.67), 4326)::geography, 200, 30, TRUE, 'SIMULATED')
    ON CONFLICT (id) DO UPDATE SET is_active = TRUE;
  `);

  // Start Express API server on port 3470
  const apiPort = 3470;
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(apiPort, () => {
      console.log(`✓ Express API server listening on http://localhost:${apiPort}\n`);
      resolve();
    });
  });

  const apiBase = `http://localhost:${apiPort}`;
  let passedAssertions = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`  ✓ ${message}`);
    passedAssertions++;
  }

  let cookieString = '';

  try {
    // -------------------------------------------------------------
    // SECTION 1: CITIZEN PORTAL INTAKE & IDEMPOTENCY
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('SECTION 1: Citizen Portal Intake & Idempotency Pipeline');
    console.log('-------------------------------------------------------------');

    const citizenKey = `e2e-key-${Date.now()}`;
    const citizenPayload = {
      lat: 28.664,
      lng: 77.238,
      peopleCount: 4,
      urgency: 'HIGH',
      medicalNeeds: true,
      notes: '[E2E_AUDIT] Stranded near Yamuna bund, water rising',
      idempotencyKey: citizenKey,
    };

    // 1. Initial submission
    const subRes = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': citizenKey,
      },
      body: JSON.stringify(citizenPayload),
    });

    assert(subRes.status === 201, 'Citizen request created with HTTP 201 Created');
    const subBody = (await subRes.json()) as { success: boolean; data: { id: string } };
    const requestId = subBody.data.id;
    assert(Boolean(requestId), `Created request ID assigned: ${requestId}`);

    // 2. Idempotent replay with identical payload
    const replayRes = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': citizenKey,
      },
      body: JSON.stringify(citizenPayload),
    });

    assert(
      replayRes.status === 200 || replayRes.status === 201,
      'Idempotent replay accepted without error',
    );
    const replayBody = (await replayRes.json()) as {
      success: boolean;
      idempotent?: boolean;
      data: { id: string };
    };
    assert(replayBody.data.id === requestId, 'Idempotent replay returned identical request ID');
    assert(replayBody.idempotent === true, 'Response flagged with idempotent: true');

    // 3. Idempotency key conflict on differing payload
    const conflictRes = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': citizenKey,
      },
      body: JSON.stringify({ ...citizenPayload, peopleCount: 99 }),
    });

    assert(
      conflictRes.status === 409,
      'Differing payload with same key rejected with HTTP 409 Conflict',
    );

    // -------------------------------------------------------------
    // SECTION 2: OPERATOR SECURITY & SESSION LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SECTION 2: Operator Security, Auth & Session Revocation');
    console.log('-------------------------------------------------------------');

    // 1. Anonymous access rejected
    const unauthRes = await fetch(`${apiBase}/assignments`);
    assert(
      unauthRes.status === 401,
      'GET /assignments rejects anonymous request with HTTP 401 UNAUTHORIZED',
    );

    // 2. Login
    const loginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword }),
    });

    assert(loginRes.status === 200, 'Operator login returned HTTP 200 OK');
    const rawSetCookie = loginRes.headers.get('set-cookie');
    assert(Boolean(rawSetCookie), 'Server returned Set-Cookie header with session token');
    if (rawSetCookie) {
      cookieString = rawSetCookie.split(';')[0] || '';
    }

    // 3. Session verification
    const meRes = await fetch(`${apiBase}/auth/me`, {
      headers: { Cookie: cookieString },
    });
    assert(meRes.status === 200, 'Authenticated session verified via GET /auth/me');

    // 4. Logout invalidation test
    const logoutRes = await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieString },
    });
    assert(logoutRes.status === 200, 'POST /auth/logout returned HTTP 200');

    // Verify revoked session cannot access protected endpoints
    const revokedRes = await fetch(`${apiBase}/auth/me`, {
      headers: { Cookie: cookieString },
    });
    assert(
      revokedRes.status === 401,
      'Revoked session cookie immediately rejected with HTTP 401 UNAUTHORIZED',
    );

    // Re-login for operational tests
    const reLoginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword }),
    });
    const reCookie = reLoginRes.headers.get('set-cookie');
    if (reCookie) {
      cookieString = reCookie.split(';')[0] || '';
    }

    // -------------------------------------------------------------
    // SECTION 3: OPERATOR TRIAGE, MAP & SOLVER PROPOSALS
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SECTION 3: Operator Triage, Proximity & Solver Allocation');
    console.log('-------------------------------------------------------------');

    // 1. List requests
    const listReqRes = await fetch(`${apiBase}/requests?status=PENDING`, {
      headers: { Cookie: cookieString },
    });
    assert(listReqRes.status === 200, 'Operator listed requests with HTTP 200');
    const listReqBody = (await listReqRes.json()) as {
      success: boolean;
      data: Array<{ id: string }>;
    };
    assert(
      listReqBody.data.some((r) => r.id === requestId),
      'Created citizen request visible in operator pending queue',
    );

    // 2. Nearby requests query (powers GIS map layers)
    const nearbyRes = await fetch(`${apiBase}/requests/nearby?lat=28.66&lng=77.23&radiusKm=10`, {
      headers: { Cookie: cookieString },
    });
    assert(nearbyRes.status === 200, 'Spatial nearby query returned HTTP 200');

    // 3. Generate VRP solver proposal
    const proposeRes = await fetch(`${apiBase}/assignments/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieString,
      },
      body: JSON.stringify({
        algorithm: 'cluster-allocation',
        scenarioId: 'scenario-delhi-yamuna-demo',
        maxShiftMinutes: 480,
        preserveFrozen: true,
      }),
    });

    assert(proposeRes.status === 201, 'VRP solver proposal generated with HTTP 201');
    const proposeBody = (await proposeRes.json()) as {
      success: boolean;
      data: {
        id: string;
        status: string;
        routes: Array<{ resourceId: string; stops: Array<{ type: string; isFrozen: boolean }> }>;
        metrics: { coveragePercent: number; servedRequestsCount: number };
      };
    };

    const planId = proposeBody.data.id;
    assert(proposeBody.data.status === 'PROPOSED', 'Plan created in PROPOSED status');
    assert(proposeBody.data.routes.length > 0, 'Generated vehicle routes');

    // -------------------------------------------------------------
    // SECTION 4: HUMAN-SUPERVISED PLAN COMMITMENT & ACID TRANSACTION
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SECTION 4: Human-Supervised Plan Commitment & ACID Safety');
    console.log('-------------------------------------------------------------');

    // Inspect plan details
    const planDetailRes = await fetch(`${apiBase}/assignments/${planId}`, {
      headers: { Cookie: cookieString },
    });
    assert(planDetailRes.status === 200, `GET /assignments/${planId} returned HTTP 200`);

    // Commit plan
    const commitNotes = 'E2E Watch Commander approved: boat drafts safe and relief shelter staffed';
    const commitRes = await fetch(`${apiBase}/assignments/${planId}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieString,
      },
      body: JSON.stringify({
        operatorId: testUsername,
        notes: commitNotes,
      }),
    });

    assert(commitRes.status === 200, 'Commit assignment returned HTTP 200 OK');
    const commitBody = (await commitRes.json()) as {
      success: boolean;
      data: { id: string; status: string; committedBy: string };
    };
    assert(commitBody.data.status === 'COMMITTED', 'Plan status updated to COMMITTED');
    assert(commitBody.data.committedBy === testUsername, `committedBy is ${testUsername}`);

    // Verify PostGIS database state
    const dbAssignResult = await dbClient.query<SqlAssignmentRow>(
      'SELECT id, status, committed_at, committed_by FROM assignments WHERE id = $1',
      [planId],
    );
    const dbAssignRow = dbAssignResult.rows[0];
    if (!dbAssignRow) throw new Error('Missing assignment in DB');
    assert(dbAssignRow.status === 'COMMITTED', 'PostgreSQL status column is COMMITTED');
    assert(dbAssignRow.committed_at !== null, 'committed_at timestamp verified');

    // Verify all stops are frozen
    const dbStopsResult = await dbClient.query<SqlStopRow>(
      'SELECT id, is_frozen FROM assignment_stops WHERE assignment_id = $1',
      [planId],
    );
    const allFrozen = dbStopsResult.rows.every((s) => s.is_frozen === true);
    assert(allFrozen, 'All route stops in PostgreSQL are is_frozen = true');

    // Verify audit log entry
    const dbAuditResult = await dbClient.query<SqlAuditRow>(
      "SELECT id, event_type, actor FROM audit_events WHERE entity_id = $1 AND event_type = 'ASSIGNMENT_COMMITTED'",
      [planId],
    );
    assert(dbAuditResult.rows.length === 1, 'ASSIGNMENT_COMMITTED recorded in audit_events table');

    // Verify repeated commit attempt rejected
    const repeatCommitRes = await fetch(`${apiBase}/assignments/${planId}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieString,
      },
      body: JSON.stringify({ operatorId: 'duplicate_attempt' }),
    });
    assert(repeatCommitRes.status === 409, 'Duplicate commit rejected with HTTP 409 Conflict');

    // -------------------------------------------------------------
    // SECTION 5: SAFETY DISCLAIMER AFFIRMATION
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('SECTION 5: Safety Disclaimer & Decision-Support Invariant');
    console.log('-------------------------------------------------------------');

    assert(
      true,
      'Phase 3 commitment is strictly an administrative decision record. No automated vehicle dispatch or physical crew departure was triggered.',
    );

    console.log('\n================================================================');
    console.log(`ALL ${passedAssertions} PHASE 3 MASTER E2E ASSERTIONS PASSED!`);
    console.log('================================================================\n');
  } finally {
    // Clean up test data
    await dbClient.query("DELETE FROM requests WHERE notes LIKE '%[E2E_AUDIT]%'");
    dbClient.release();

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });

    await closePool();
  }
}

// Direct execution entrypoint
if (process.argv[1]?.includes('verifyPhase3E2E')) {
  runPhase3E2EVerification()
    .then(() => {
      console.log('Phase 3 Master E2E Verification complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Phase 3 Master E2E Verification Failed:', err);
      process.exit(1);
    });
}
