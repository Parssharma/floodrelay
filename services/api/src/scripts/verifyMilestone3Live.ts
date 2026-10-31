import http from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { getPool, closePool } from '../db/connection.js';

interface SqlRequestRow {
  id: string;
  lat: number;
  lng: number;
  people_count: number;
  urgency: string;
  source: string;
  status: string;
  notes: string | null;
  medical_needs: boolean;
  is_flagged_duplicate: boolean;
  duplicate_of_id: string | null;
  created_at: string;
}

async function runMilestone3Verification(): Promise<void> {
  console.log('================================================================');
  console.log('FLOODRELAY MILESTONE 3: OPERATOR AUTH & DASHBOARD LIVE AUDIT');
  console.log('================================================================\n');

  const pool = getPool();
  const dbClient = await pool.connect();
  console.log('✓ Connected to PostgreSQL/PostGIS database');

  // Verify PostGIS extension
  const postgisVersion = await dbClient.query('SELECT PostGIS_Full_Version()');
  console.log(`✓ PostGIS Version: ${postgisVersion.rows[0].postgis_full_version.split(' ')[0]}`);

  // Seed / ensure test operator exists in operators table
  const testUsername = 'test_commander';
  const testPassword = 'SecureOperatorPass2026!';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(testPassword, salt, 64).toString('hex');

  await dbClient.query(
    `INSERT INTO operators (id, username, password_hash, salt, name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = $3, salt = $4, updated_at = NOW()`,
    ['op-test-cmd-001', testUsername, passwordHash, salt, 'Commander Sarah Chen', 'DISPATCHER'],
  );
  console.log(`✓ Seeded test operator: ${testUsername} (Role: DISPATCHER)`);

  // Clean up any stale synthetic test requests
  await dbClient.query("DELETE FROM requests WHERE notes LIKE '%[SYNTHETIC_M3_AUDIT]%'");

  // Start Express API server on test port 3458
  const apiPort = 3458;
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

  try {
    // -------------------------------------------------------------
    // TEST 1: Citizen Rescue Request Intake (Remains 100% Unauthenticated)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 1: Citizen Rescue Request Intake (Unauthenticated Public POST)');
    console.log('-------------------------------------------------------------');

    const testIdempotencyKey = `m3-citizen-test-${Date.now()}`;
    const citizenPayload = {
      lat: 29.7604,
      lng: -95.3698,
      peopleCount: 5,
      urgency: 'CRITICAL',
      medicalNeeds: true,
      notes: '[SYNTHETIC_M3_AUDIT] Trapped on roof in Sector 4, elder requires oxygen tank',
      idempotencyKey: testIdempotencyKey,
    };

    const citizenRes = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify(citizenPayload),
    });

    const citizenStatus = citizenRes.status;
    const citizenBody = await citizenRes.json();

    assert(
      citizenStatus === 201,
      `Citizen POST /requests returned HTTP 201 (got ${citizenStatus})`,
    );
    assert(citizenBody.success === true, 'Response body indicated success: true');
    assert(Boolean(citizenBody.data?.id), `Generated request ID: ${citizenBody.data?.id}`);
    const createdRequestId = citizenBody.data.id;

    // Verify in PostgreSQL/PostGIS database directly
    const dbResult = await dbClient.query<SqlRequestRow>(
      'SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, people_count, urgency, notes, medical_needs, status, ST_AsText(location) as location_wkt FROM requests WHERE id = $1',
      [createdRequestId],
    );
    assert(dbResult.rows.length === 1, 'Record successfully persisted in PostGIS requests table');
    const dbRow = dbResult.rows[0];
    assert(dbRow.urgency === 'CRITICAL', 'Persisted urgency is CRITICAL');
    assert(dbRow.people_count === 5, 'Persisted people_count is 5');
    assert(dbRow.medical_needs === true, 'Persisted medical_needs is true');
    console.log(
      `  ✓ PostGIS Location WKT: ${(dbRow as unknown as { location_wkt: string }).location_wkt}`,
    );

    // -------------------------------------------------------------
    // TEST 2: Route Protection on Operator Endpoints (401 Unauthorized)
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 2: Strict Route Protection on Operator Endpoints');
    console.log('-------------------------------------------------------------');

    // Anonymous GET /requests
    const anonRequestsRes = await fetch(`${apiBase}/requests`);
    assert(anonRequestsRes.status === 401, 'Anonymous GET /requests rejected with HTTP 401');
    const anonRequestsBody = await anonRequestsRes.json();
    assert(anonRequestsBody.error?.code === 'UNAUTHORIZED', 'Error code is UNAUTHORIZED');

    // Anonymous GET /requests/:id
    const anonRequestItemRes = await fetch(`${apiBase}/requests/${createdRequestId}`);
    assert(anonRequestItemRes.status === 401, 'Anonymous GET /requests/:id rejected with HTTP 401');

    // Anonymous GET /assignments
    const anonAssignmentsRes = await fetch(`${apiBase}/assignments`);
    assert(anonAssignmentsRes.status === 401, 'Anonymous GET /assignments rejected with HTTP 401');

    // Public GET /health remains open
    const healthRes = await fetch(`${apiBase}/health`);
    assert(healthRes.status === 200, 'Public GET /health responds with HTTP 200');

    // -------------------------------------------------------------
    // TEST 3: Operator Authentication & Session Creation
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 3: Operator Authentication & Session Creation');
    console.log('-------------------------------------------------------------');

    // Bad password attempt
    const badLoginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: 'WrongPassword999!' }),
    });
    assert(badLoginRes.status === 401, 'Invalid credentials rejected with HTTP 401');

    // Good password attempt
    const goodLoginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword }),
    });
    assert(goodLoginRes.status === 200, 'Valid credentials authenticated with HTTP 200');
    const loginBody = await goodLoginRes.json();
    assert(loginBody.success === true, 'Login response success is true');
    assert(Boolean(loginBody.data?.token), 'Received cryptographic session token');
    assert(loginBody.data?.operator?.username === testUsername, 'Operator username matches');
    assert(loginBody.data?.operator?.role === 'DISPATCHER', 'Operator role is DISPATCHER');
    assert(
      loginBody.data?.operator?.password_hash === undefined,
      'No password_hash exposed in response',
    );
    assert(loginBody.data?.operator?.salt === undefined, 'No salt exposed in response');

    const sessionCookieHeader = goodLoginRes.headers.get('set-cookie');
    assert(
      Boolean(sessionCookieHeader),
      'Received Set-Cookie header with HTTP-only session cookie',
    );
    assert(
      sessionCookieHeader!.includes('floodrelay_session='),
      'Cookie name is floodrelay_session',
    );
    assert(sessionCookieHeader!.includes('HttpOnly'), 'Cookie is flagged HttpOnly');

    const sessionToken = loginBody.data.token;

    // -------------------------------------------------------------
    // TEST 4: Authorized Operator Access (Bearer Token & Cookie)
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 4: Authorized Operator Access & Live Request Inspection');
    console.log('-------------------------------------------------------------');

    // GET /auth/me with Bearer token
    const meRes = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(meRes.status === 200, 'GET /auth/me with Bearer token returned HTTP 200');
    const meBody = await meRes.json();
    assert(
      meBody.data?.operator?.name === 'Commander Sarah Chen',
      'Profile name returned accurately',
    );

    // GET /requests with Bearer token
    const authRequestsRes = await fetch(`${apiBase}/requests`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(authRequestsRes.status === 200, 'GET /requests with Bearer token returned HTTP 200');
    const authRequestsBody = await authRequestsRes.json();
    assert(Array.isArray(authRequestsBody.data), 'GET /requests returned array of requests');
    const foundRequest = authRequestsBody.data.find(
      (r: { id: string }) => r.id === createdRequestId,
    );
    assert(Boolean(foundRequest), 'Submitted citizen rescue request present in operator stream');
    assert(foundRequest.urgency === 'CRITICAL', 'Urgency matches submitted value');
    assert(foundRequest.peopleCount === 5, 'People count matches submitted value');

    // GET /requests/:id with Cookie
    const cookieString = sessionCookieHeader!.split(';')[0];
    const itemWithCookieRes = await fetch(`${apiBase}/requests/${createdRequestId}`, {
      headers: { Cookie: cookieString },
    });
    assert(
      itemWithCookieRes.status === 200,
      'GET /requests/:id with HTTP-only cookie returned HTTP 200',
    );
    const itemBody = await itemWithCookieRes.json();
    assert(
      itemBody.data?.notes?.includes('[SYNTHETIC_M3_AUDIT]'),
      'Caller field notes match database record',
    );

    // -------------------------------------------------------------
    // TEST 5: Operator Logout & Session Revocation
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 5: Operator Logout & Session Invalidation');
    console.log('-------------------------------------------------------------');

    const logoutRes = await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(logoutRes.status === 200, 'POST /auth/logout returned HTTP 200');

    // Subsequent access with revoked session token must be rejected
    const revokedAccessRes = await fetch(`${apiBase}/requests`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(
      revokedAccessRes.status === 401,
      'Access with logged-out session token rejected with HTTP 401',
    );

    console.log('\n=============================================================');
    console.log(`ALL ${passedAssertions} MILESTONE 3 VERIFICATION ASSERTIONS PASSED!`);
    console.log('=============================================================');
  } finally {
    // Clean up synthetic test records
    await dbClient.query("DELETE FROM requests WHERE notes LIKE '%[SYNTHETIC_M3_AUDIT]%'");
    await dbClient.query("DELETE FROM operators WHERE id = 'op-test-cmd-001'");
    dbClient.release();
    await closePool();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('✓ Database connection released and test server closed cleanly.');
  }
}

runMilestone3Verification().catch((err) => {
  console.error('\n❌ Milestone 3 Verification Failed:', err);
  process.exit(1);
});
