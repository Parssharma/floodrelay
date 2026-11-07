import { describe, it, expect } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { getPool } from '../db/connection.js';
import { assertDisposableTestDatabase, FixtureRegistry } from './realRepairVerificationHelper.js';

const requireDb = Boolean(
  process.env.REQUIRE_DB && process.env.REQUIRE_DB !== '0' && process.env.REQUIRE_DB !== 'false',
);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const shouldRun = requireDb || hasDatabaseUrl;

describe('Database Safety Guard & Fixture Isolation Tests (Correction 1 Safety)', () => {
  it('refuses to run without explicit test authorization (ALLOW_DISPOSABLE_REPAIR_TEST_DB)', async () => {
    const originalAuth = process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    const originalCi = process.env.CI;
    try {
      delete process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
      delete process.env.CI;

      const mockPool = {
        options: { host: 'localhost' },
        connect: async () => ({
          query: async () => ({ rows: [{ db_name: 'floodrelay_test', server_addr: '127.0.0.1' }] }),
          release: () => {},
        }),
      } as unknown as pg.Pool;

      await expect(assertDisposableTestDatabase(mockPool)).rejects.toThrow(
        /UNAUTHORIZED_TEST_EXECUTION/,
      );
    } finally {
      if (originalAuth !== undefined) process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = originalAuth;
      if (originalCi !== undefined) process.env.CI = originalCi;
    }
  });

  it('refuses to run against a production-named database', async () => {
    const originalAuth = process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    try {
      process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = '1';

      const mockPool = {
        options: { host: 'localhost' },
        connect: async () => ({
          query: async () => ({
            rows: [{ db_name: 'floodrelay_production_us_east', server_addr: '127.0.0.1' }],
          }),
          release: () => {},
        }),
      } as unknown as pg.Pool;

      await expect(assertDisposableTestDatabase(mockPool)).rejects.toThrow(
        /UNSAFE_DATABASE_DETECTED/,
      );
    } finally {
      if (originalAuth !== undefined) process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = originalAuth;
      else delete process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    }
  });

  it('refuses to run against a staging-named database', async () => {
    const originalAuth = process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    try {
      process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = '1';

      const mockPool = {
        options: { host: 'localhost' },
        connect: async () => ({
          query: async () => ({
            rows: [{ db_name: 'floodrelay_staging_cluster', server_addr: '127.0.0.1' }],
          }),
          release: () => {},
        }),
      } as unknown as pg.Pool;

      await expect(assertDisposableTestDatabase(mockPool)).rejects.toThrow(
        /UNSAFE_DATABASE_DETECTED/,
      );
    } finally {
      if (originalAuth !== undefined) process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = originalAuth;
      else delete process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    }
  });

  it('refuses to run against an unrecognized database', async () => {
    const originalAuth = process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    try {
      process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = '1';

      const mockPool = {
        options: { host: 'localhost' },
        connect: async () => ({
          query: async () => ({
            rows: [{ db_name: 'customer_orders_db', server_addr: '127.0.0.1' }],
          }),
          release: () => {},
        }),
      } as unknown as pg.Pool;

      await expect(assertDisposableTestDatabase(mockPool)).rejects.toThrow(
        /UNRECOGNIZED_TEST_DATABASE/,
      );
    } finally {
      if (originalAuth !== undefined) process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = originalAuth;
      else delete process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    }
  });

  it('fails with descriptive error when database connection fails and verification is required', async () => {
    const originalAuth = process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    try {
      process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = '1';

      const mockPool = {
        options: { host: 'localhost' },
        connect: async () => {
          throw new Error('Connection refused on port 5432');
        },
      } as unknown as pg.Pool;

      await expect(assertDisposableTestDatabase(mockPool)).rejects.toThrow(
        /DATABASE_CONNECTION_FAILED/,
      );
    } finally {
      if (originalAuth !== undefined) process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB = originalAuth;
      else delete process.env.ALLOW_DISPOSABLE_REPAIR_TEST_DB;
    }
  });
});

describe.runIf(shouldRun)('Live Database Fixture Isolation & Non-Destructive Cleanup Tests', () => {
  it('cleanup deletes only records created by the test run and preserves existing unrelated proposals', async () => {
    const pool = getPool();
    // Verify database guard
    await assertDisposableTestDatabase(pool);

    const testRunRegistry = new FixtureRegistry();
    const unrelatedRegistry = new FixtureRegistry();

    // 1. Seed an unrelated proposal that looks like a repair proposal
    const unrelatedProposalId = `prop-repair-unrelated-${crypto.randomUUID()}`;
    unrelatedRegistry.trackAssignment(unrelatedProposalId);

    await pool.query(
      `INSERT INTO assignments (id, scenario_id, status, metrics, unserved, created_at, updated_at)
       VALUES ($1, 'scenario-unrelated', 'PROPOSED', '{}'::jsonb, '[]'::jsonb, NOW(), NOW());`,
      [unrelatedProposalId],
    );

    // 2. Seed an unrelated committed assignment
    const unrelatedCommittedId = `asgn-committed-unrelated-${crypto.randomUUID()}`;
    unrelatedRegistry.trackAssignment(unrelatedCommittedId);

    await pool.query(
      `INSERT INTO assignments (id, scenario_id, status, metrics, unserved, committed_at, committed_by, created_at, updated_at)
       VALUES ($1, 'scenario-unrelated', 'COMMITTED', '{}'::jsonb, '[]'::jsonb, NOW(), 'TEST_OPERATOR', NOW(), NOW());`,
      [unrelatedCommittedId],
    );

    // 3. Seed fixtures owned by the test run
    const testProposalId = `prop-repair-test-${testRunRegistry.runId}`;
    testRunRegistry.trackAssignment(testProposalId);

    await pool.query(
      `INSERT INTO assignments (id, scenario_id, status, metrics, unserved, created_at, updated_at)
       VALUES ($1, 'scenario-test', 'PROPOSED', '{}'::jsonb, '[]'::jsonb, NOW(), NOW());`,
      [testProposalId],
    );

    try {
      // 4. Run cleanup on the test run registry ONLY
      await testRunRegistry.cleanup(pool);

      // 5. Verify the test run proposal WAS deleted
      const testCheck = await pool.query('SELECT id FROM assignments WHERE id = $1;', [
        testProposalId,
      ]);
      expect(testCheck.rows.length).toBe(0);

      // 6. CRITICAL: Verify existing unrelated proposal WAS PRESERVED!
      const unrelatedCheck = await pool.query('SELECT id FROM assignments WHERE id = $1;', [
        unrelatedProposalId,
      ]);
      expect(unrelatedCheck.rows.length).toBe(1);

      // 7. CRITICAL: Verify existing committed assignment WAS PRESERVED!
      const committedCheck = await pool.query('SELECT id FROM assignments WHERE id = $1;', [
        unrelatedCommittedId,
      ]);
      expect(committedCheck.rows.length).toBe(1);
    } finally {
      // Clean up the unrelated test row
      await unrelatedRegistry.cleanup(pool);
    }
  });

  it('proves concurrent or repeated test runs do not collide or delete each other’s fixtures', async () => {
    const pool = getPool();
    await assertDisposableTestDatabase(pool);

    const runA = new FixtureRegistry();
    const runB = new FixtureRegistry();

    const reqA = runA.generateId('req');
    const reqB = runB.generateId('req');
    runA.requestIds.add(reqA);
    runB.requestIds.add(reqB);

    await pool.query(
      `INSERT INTO requests (id, location, people_count, urgency, status, source, created_at, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.2, 28.5), 4326), 2, 'HIGH', 'PENDING', 'SIMULATED', NOW(), NOW()),
              ($2, ST_SetSRID(ST_MakePoint(77.3, 28.6), 4326), 1, 'LOW', 'PENDING', 'SIMULATED', NOW(), NOW());`,
      [reqA, reqB],
    );

    try {
      // Clean up run A only
      await runA.cleanup(pool);

      // reqA must be deleted
      const checkA = await pool.query('SELECT id FROM requests WHERE id = $1;', [reqA]);
      expect(checkA.rows.length).toBe(0);

      // reqB must STILL EXIST (not deleted by run A's cleanup!)
      const checkB = await pool.query('SELECT id FROM requests WHERE id = $1;', [reqB]);
      expect(checkB.rows.length).toBe(1);
    } finally {
      await runB.cleanup(pool);
    }
  });

  it('test fixture cleanup works reliably in finally block after test assertion failure', async () => {
    const pool = getPool();
    await assertDisposableTestDatabase(pool);

    const failingRun = new FixtureRegistry();
    const reqFail = failingRun.generateId('req_fail');
    failingRun.requestIds.add(reqFail);

    await pool.query(
      `INSERT INTO requests (id, location, people_count, urgency, status, source, created_at, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.2, 28.5), 4326), 2, 'HIGH', 'PENDING', 'SIMULATED', NOW(), NOW());`,
      [reqFail],
    );

    // Simulate an assertion error inside a try...finally block
    let caughtError: Error | undefined;
    try {
      try {
        throw new Error('SIMULATED_ASSERTION_FAILURE');
      } finally {
        await failingRun.cleanup(pool);
      }
    } catch (err: unknown) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toBe('SIMULATED_ASSERTION_FAILURE');

    // Verify cleanup ran and deleted the fixture despite the failure
    const check = await pool.query('SELECT id FROM requests WHERE id = $1;', [reqFail]);
    expect(check.rows.length).toBe(0);
  });
});
