import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createApp } from '../app.js';
import { getPool, closePool } from '../db/connection.js';

async function waitForHttp(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function runE2EVerification(): Promise<void> {
  console.log('================================================================');
  console.log('E2E VERIFICATION: Next.js Frontend Proxy -> Express API -> PostGIS');
  console.log('================================================================\n');

  const pool = getPool();
  const dbClient = await pool.connect();
  console.log('✓ Connected to PostgreSQL database');

  // Start Express API server on port 3000
  const expressPort = 3000;
  const app = createApp();
  const expressServer = http.createServer(app);

  await new Promise<void>((resolve) => {
    expressServer.listen(expressPort, () => {
      console.log(`✓ Express API server listening on http://localhost:${expressPort}`);
      resolve();
    });
  });

  // Verify Express health directly
  const expressHealthy = await waitForHttp(`http://localhost:${expressPort}/health`);
  if (!expressHealthy) throw new Error('Express API failed to respond to /health');
  console.log('✓ Express API health check passed');

  // Start Next.js production server on port 3001
  const webDir = path.resolve(process.cwd(), '../../apps/web');
  console.log(`Starting Next.js on port 3001 (working directory: ${webDir})...`);

  const nextProcess: ChildProcess = spawn('npx', ['next', 'start', '-p', '3001'], {
    cwd: webDir,
    env: {
      ...process.env,
      PORT: '3001',
      BACKEND_API_URL: `http://localhost:${expressPort}`,
    },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let nextStdout = '';
  let nextStderr = '';
  nextProcess.stdout?.on('data', (d) => {
    nextStdout += d.toString();
  });
  nextProcess.stderr?.on('data', (d) => {
    nextStderr += d.toString();
  });

  try {
    const nextHealthy = await waitForHttp('http://localhost:3001/citizen/request', 25000);
    if (!nextHealthy) {
      console.error('Next.js stdout:', nextStdout);
      console.error('Next.js stderr:', nextStderr);
      throw new Error('Next.js web server failed to become ready on http://localhost:3001');
    }
    console.log('✓ Next.js server ready at http://localhost:3001');

    // 1. Check Next.js rewrite proxy for /health
    const proxyHealthRes = await fetch('http://localhost:3001/health');
    const proxyHealthBody = await proxyHealthRes.json();
    console.log(
      `✓ Next.js -> Express /health proxy status: HTTP ${proxyHealthRes.status} (status: ${proxyHealthBody.status})`,
    );

    // 2. Submit synthetic Citizen request via Next.js proxy on port 3001
    const testKey = `e2e-citizen-proxy-${Date.now()}`;
    const payload = {
      lat: 28.6289,
      lng: 77.2155,
      peopleCount: 3,
      urgency: 'CRITICAL',
      medicalNeeds: true,
      notes: '[SYNTHETIC_TEST_MILESTONE_2] Next.js Proxy E2E verification test submission',
      idempotencyKey: testKey,
    };

    console.log('\nSubmitting Citizen request to Next.js (http://localhost:3001/requests)...');
    const submitRes = await fetch('http://localhost:3001/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify(payload),
    });

    const submitStatus = submitRes.status;
    const submitBody = await submitRes.json();

    console.log(`Next.js Response: HTTP ${submitStatus} ${submitRes.statusText}`);
    console.log('Response payload:', JSON.stringify(submitBody, null, 2));

    if (submitStatus !== 201) {
      throw new Error(`Expected HTTP 201 from Next.js proxy, got ${submitStatus}`);
    }

    const createdId = submitBody.data.id;

    // 3. Verify in PostgreSQL
    console.log(`\nVerifying request ${createdId} directly in PostgreSQL/PostGIS:`);
    const dbRes = await dbClient.query(
      `SELECT 
        id, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        ST_AsText(location) as location_wkt, 
        people_count, 
        urgency, 
        status, 
        source, 
        notes, 
        idempotency_key, 
        idempotency_request_hash, 
        is_flagged_duplicate, 
        created_at 
       FROM requests 
       WHERE id = $1`,
      [createdId],
    );

    if (dbRes.rows.length === 0 || !dbRes.rows[0]) {
      throw new Error(`Record ${createdId} not found in database!`);
    }

    console.log('PostgreSQL Persisted Record:');
    console.log(JSON.stringify(dbRes.rows[0], null, 2));

    // 4. Test Idempotent Replay through Next.js proxy
    console.log(
      '\nTesting Idempotent Replay via Next.js proxy (http://localhost:3001/requests)...',
    );
    const replayRes = await fetch('http://localhost:3001/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify(payload),
    });

    const replayBody = await replayRes.json();
    console.log(
      `Next.js Replay Response: HTTP ${replayRes.status} (idempotent: ${replayBody.idempotent}, id: ${replayBody.data?.id})`,
    );

    if (replayRes.status !== 200 && replayRes.status !== 201) {
      throw new Error(`Expected 200/201 on replay, got ${replayRes.status}`);
    }
    if (replayBody.data?.id !== createdId) {
      throw new Error(`Replay returned mismatched ID: ${replayBody.data?.id} !== ${createdId}`);
    }

    // 5. Cleanup
    const cleanup = await dbClient.query(
      "DELETE FROM requests WHERE notes LIKE '%[SYNTHETIC_TEST_MILESTONE_2]%'",
    );
    console.log(`\nCleaned up ${cleanup.rowCount} synthetic test records from database.`);

    console.log('\n================================================================');
    console.log('E2E VERIFICATION SUCCESSFUL: Next.js -> Express -> PostGIS');
    console.log('================================================================');
  } finally {
    // Graceful teardown
    nextProcess.kill('SIGTERM');
    await new Promise<void>((r) => {
      expressServer.close(() => r());
    });
    dbClient.release();
    await closePool();
  }
}

runE2EVerification().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
