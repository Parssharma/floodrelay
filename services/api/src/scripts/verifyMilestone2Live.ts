import http from 'node:http';
import { createApp } from '../app.js';
import { getPool, closePool } from '../db/connection.js';

interface SqlRow {
  id: string;
  lat: number;
  lng: number;
  location_wkt: string;
  people_count: number;
  urgency: string;
  source: string;
  status: string;
  verification_status: string;
  medical_needs: boolean;
  notes: string | null;
  idempotency_key: string | null;
  idempotency_request_hash: string | null;
  is_flagged_duplicate: boolean;
  duplicate_of_id: string | null;
  created_at: string;
  updated_at: string;
}

async function runLiveVerification(): Promise<void> {
  console.log('================================================================');
  console.log('FLOODRELAY MILESTONE 2: LIVE PERSISTENCE & HARDENING AUDIT');
  console.log('================================================================\n');

  const pool = getPool();
  const dbClient = await pool.connect();
  console.log('✓ Connected to PostgreSQL/PostGIS database');

  // Verify PostGIS extension is installed
  const postgisVersionResult = await dbClient.query('SELECT PostGIS_Full_Version()');
  console.log(
    `✓ PostGIS Version: ${postgisVersionResult.rows[0].postgis_full_version.split(' ')[0]} ${postgisVersionResult.rows[0].postgis_full_version.split(' ')[1]}`,
  );

  // Clean up any stale synthetic test records
  const initCleanup = await dbClient.query(
    "DELETE FROM requests WHERE notes LIKE '%[SYNTHETIC_TEST_MILESTONE_2]%'",
  );
  if (initCleanup.rowCount && initCleanup.rowCount > 0) {
    console.log(`✓ Cleaned up ${initCleanup.rowCount} stale synthetic records before test run.`);
  }

  // Start Express API server on port 3456
  const apiPort = 3456;
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(apiPort, () => {
      console.log(`✓ Express API server listening on http://localhost:${apiPort}\n`);
      resolve();
    });
  });

  const apiBase = `http://localhost:${apiPort}`;

  try {
    // -------------------------------------------------------------
    // 1. SYNTHETIC CITIZEN PORTAL SUBMISSION & PERSISTENCE
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 1: Synthetic Citizen Rescue Request Submission');
    console.log('-------------------------------------------------------------');

    const testIdempotencyKey = `synthetic-citizen-test-${Date.now()}`;
    const syntheticPayload = {
      lat: 28.6139,
      lng: 77.209,
      peopleCount: 4,
      urgency: 'HIGH',
      medicalNeeds: true,
      notes:
        '[SYNTHETIC_TEST_MILESTONE_2] Stranded on rooftop near Yamuna Bank, water rising rapidly',
      idempotencyKey: testIdempotencyKey,
    };

    console.log('Submitting POST /requests with payload:');
    console.log(JSON.stringify(syntheticPayload, null, 2));

    const postResponse = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify(syntheticPayload),
    });

    const postStatus = postResponse.status;
    const postBody = await postResponse.json();

    console.log(`\nAPI Response Status: HTTP ${postStatus} ${postResponse.statusText}`);
    console.log('API Response Body:');
    console.log(JSON.stringify(postBody, null, 2));

    if (postStatus !== 201) {
      throw new Error(`Expected HTTP 201, got ${postStatus}`);
    }

    const createdRequestId = postBody.data.id;

    // Verify row directly in PostgreSQL/PostGIS
    console.log('\nQuerying PostgreSQL for persisted record:');
    const dbResult = await dbClient.query<SqlRow>(
      `SELECT 
        id, 
        ST_Y(location::geometry) AS lat, 
        ST_X(location::geometry) AS lng, 
        ST_AsText(location) AS location_wkt, 
        people_count, 
        urgency, 
        source,
        status,
        verification_status,
        medical_needs, 
        notes, 
        idempotency_key, 
        idempotency_request_hash, 
        is_flagged_duplicate, 
        duplicate_of_id,
        created_at,
        updated_at 
       FROM requests 
       WHERE id = $1`,
      [createdRequestId],
    );

    if (dbResult.rows.length === 0 || !dbResult.rows[0]) {
      throw new Error(`Record ${createdRequestId} was NOT found in PostgreSQL database!`);
    }

    const row: SqlRow = dbResult.rows[0];
    console.log('PostgreSQL Persisted Record:');
    console.log(JSON.stringify(row, null, 2));

    // Assertions
    if (Math.abs(row.lat - syntheticPayload.lat) > 0.0001) throw new Error('Latitude mismatch');
    if (Math.abs(row.lng - syntheticPayload.lng) > 0.0001) throw new Error('Longitude mismatch');
    if (row.location_wkt !== `POINT(${syntheticPayload.lng} ${syntheticPayload.lat})`) {
      throw new Error(
        `Geometry mismatch: expected POINT(${syntheticPayload.lng} ${syntheticPayload.lat}), got ${row.location_wkt}`,
      );
    }
    if (row.people_count !== syntheticPayload.peopleCount) throw new Error('people_count mismatch');
    if (row.urgency !== syntheticPayload.urgency) throw new Error('urgency mismatch');
    if (row.medical_needs !== syntheticPayload.medicalNeeds)
      throw new Error('medical_needs mismatch');
    if (row.idempotency_key !== testIdempotencyKey) throw new Error('idempotency_key mismatch');
    if (!row.idempotency_request_hash) throw new Error('idempotency_request_hash is missing');
    if (row.status !== 'PENDING') throw new Error(`Expected PENDING, got ${row.status}`);
    if (row.source !== 'REPORTED') throw new Error(`Expected REPORTED, got ${row.source}`);
    if (row.is_flagged_duplicate !== false)
      throw new Error('Expected is_flagged_duplicate = false for initial report');

    console.log(
      '✓ TEST 1 PASSED: Request persisted accurately with PostGIS POINT geography, status PENDING, and SHA-256 idempotency hash.\n',
    );

    // -------------------------------------------------------------
    // 2. IDEMPOTENT REPLAY VERIFICATION
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 2: Idempotent Replay (Identical Payload & Key)');
    console.log('-------------------------------------------------------------');

    const replayResponse = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify(syntheticPayload),
    });

    const replayStatus = replayResponse.status;
    const replayBody = await replayResponse.json();

    console.log(`Replay Status: HTTP ${replayStatus}`);
    console.log(`Replay Response Request ID: ${replayBody.data?.id}`);
    console.log(`Replay Response idempotent flag: ${replayBody.idempotent}`);

    if (replayStatus !== 200 && replayStatus !== 201) {
      throw new Error(`Expected HTTP 200/201 on idempotent replay, got ${replayStatus}`);
    }
    if (replayBody.data?.id !== createdRequestId) {
      throw new Error(
        `Idempotent replay returned different ID: ${replayBody.data?.id} !== ${createdRequestId}`,
      );
    }
    if (replayBody.idempotent !== true) {
      throw new Error(`Expected idempotent: true in response, got ${replayBody.idempotent}`);
    }

    // Check count in database
    const countResult = await dbClient.query(
      'SELECT COUNT(*)::int AS count FROM requests WHERE idempotency_key = $1',
      [testIdempotencyKey],
    );
    console.log(`Database records with key '${testIdempotencyKey}': ${countResult.rows[0].count}`);
    if (countResult.rows[0].count !== 1) {
      throw new Error(`Expected exactly 1 record, found ${countResult.rows[0].count}`);
    }

    console.log(
      '✓ TEST 2 PASSED: Idempotent replay returned existing record without duplicate insertion.\n',
    );

    // -------------------------------------------------------------
    // 3. IDEMPOTENCY CONFLICT VERIFICATION
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 3: Idempotency Payload Conflict (Altered Payload with Same Key)');
    console.log('-------------------------------------------------------------');

    const conflictingPayload = {
      ...syntheticPayload,
      peopleCount: 12, // Different count!
      urgency: 'CRITICAL', // Different urgency!
    };

    const conflictResponse = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify(conflictingPayload),
    });

    const conflictStatus = conflictResponse.status;
    const conflictBody = await conflictResponse.json();

    console.log(`Conflict Response Status: HTTP ${conflictStatus}`);
    console.log('Conflict Response Body:');
    console.log(JSON.stringify(conflictBody, null, 2));

    if (conflictStatus !== 409) {
      throw new Error(`Expected HTTP 409 Conflict, got ${conflictStatus}`);
    }
    if (
      conflictBody.error?.code !== 'IDEMPOTENCY_KEY_REUSED' &&
      conflictBody.error?.code !== 'IDEMPOTENCY_CONFLICT'
    ) {
      throw new Error(
        `Expected error code IDEMPOTENCY_KEY_REUSED or IDEMPOTENCY_CONFLICT, got ${conflictBody.error?.code}`,
      );
    }

    console.log(
      '✓ TEST 3 PASSED: Mismatched payload with reused idempotency key correctly rejected with HTTP 409 IDEMPOTENCY_KEY_REUSED.\n',
    );

    // -------------------------------------------------------------
    // 4. SPATIAL DUPLICATE DETECTION (WITHIN 50 METERS)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 4: Spatial Duplicate Detection (Nearby Rescue Request)');
    console.log('-------------------------------------------------------------');

    // 28.6139 + ~0.00018 deg lat is approx 20 meters away
    const duplicateKey = `synthetic-citizen-dup-${Date.now()}`;
    const nearbyPayload = {
      lat: 28.61408,
      lng: 77.20912,
      peopleCount: 2,
      urgency: 'HIGH',
      medicalNeeds: false,
      notes: '[SYNTHETIC_TEST_MILESTONE_2] Neighbor reporting same flooded building',
      idempotencyKey: duplicateKey,
    };

    const dupResponse = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': duplicateKey,
      },
      body: JSON.stringify(nearbyPayload),
    });

    const dupStatus = dupResponse.status;
    const dupBody = await dupResponse.json();

    console.log(`Duplicate Request Status: HTTP ${dupStatus}`);
    console.log(`isFlaggedDuplicate returned by API: ${dupBody.data?.isFlaggedDuplicate}`);
    console.log(`duplicateOfId returned by API: ${dupBody.data?.duplicateOfId}`);

    const dupRequestId = dupBody.data?.id;
    const dupDbResult = await dbClient.query<SqlRow>(
      'SELECT id, is_flagged_duplicate, duplicate_of_id FROM requests WHERE id = $1',
      [dupRequestId],
    );

    const dupRow = dupDbResult.rows[0];
    if (!dupRow) {
      throw new Error(`Duplicate request ${dupRequestId} was NOT found in PostgreSQL database!`);
    }

    console.log(`is_flagged_duplicate in PostgreSQL: ${dupRow.is_flagged_duplicate}`);
    console.log(`duplicate_of_id in PostgreSQL: ${dupRow.duplicate_of_id}`);

    if (!dupBody.data?.isFlaggedDuplicate || !dupRow.is_flagged_duplicate) {
      throw new Error('Expected request to be flagged as spatial duplicate within 50m');
    }
    if (dupRow.duplicate_of_id !== createdRequestId) {
      throw new Error(
        `Expected duplicate_of_id to reference ${createdRequestId}, got ${dupRow.duplicate_of_id}`,
      );
    }

    console.log(
      '✓ TEST 4 PASSED: Nearby request (<50m) successfully flagged as spatial duplicate with reference to original request.\n',
    );

    // -------------------------------------------------------------
    // 5. FAILURE HANDLING & INPUT VALIDATION
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 5: Failure Handling (Zod Input Validation)');
    console.log('-------------------------------------------------------------');

    const invalidPayload = {
      lat: 195.0, // Invalid latitude (> 90)
      lng: 77.209,
      peopleCount: -3, // Invalid negative headcount
      urgency: 'SUPER_URGENT', // Invalid urgency enum
    };

    const failResponse = await fetch(`${apiBase}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload),
    });

    const failStatus = failResponse.status;
    const failBody = await failResponse.json();

    console.log(`Failure Response Status: HTTP ${failStatus}`);
    console.log('Failure Response Body:');
    console.log(JSON.stringify(failBody, null, 2));

    if (failStatus !== 400) {
      throw new Error(`Expected HTTP 400 Bad Request, got ${failStatus}`);
    }
    if (failBody.error?.code !== 'VALIDATION_ERROR') {
      throw new Error(`Expected VALIDATION_ERROR code, got ${failBody.error?.code}`);
    }

    console.log(
      '✓ TEST 5 PASSED: Malformed input properly rejected with HTTP 400 VALIDATION_ERROR.\n',
    );

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('Cleaning up synthetic test records from database...');
    const cleanupResult = await dbClient.query(
      "DELETE FROM requests WHERE notes LIKE '%[SYNTHETIC_TEST_MILESTONE_2]%'",
    );
    console.log(`Cleaned up ${cleanupResult.rowCount} test records.\n`);

    console.log('================================================================');
    console.log('ALL 5 LIVE PERSISTENCE & HARDENING AUDIT TESTS PASSED!');
    console.log('================================================================');
  } finally {
    dbClient.release();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await closePool();
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ AUDIT FAILED WITH ERROR:', err);
  process.exit(1);
});
