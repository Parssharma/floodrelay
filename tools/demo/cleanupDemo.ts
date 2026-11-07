import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from '@floodrelay/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function verifyDemoDatabaseSafety(): void {
  const nodeMajor = parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (nodeMajor < 24) {
    throw new Error(`Node.js version 24 or higher is required. Found v${process.versions.node}`);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEMO SAFETY VIOLATION: Cannot run demo scripts in production environment (NODE_ENV=production). Aborting.',
    );
  }

  const dbUrl = process.env.DATABASE_URL || '';
  const dbName = process.env.PGDATABASE || '';
  const allowedPatterns = ['floodrelay', 'demo', 'test'];
  const isAllowed = allowedPatterns.some(
    (pattern) => dbUrl.toLowerCase().includes(pattern) || dbName.toLowerCase().includes(pattern),
  );

  if (!isAllowed) {
    throw new Error(
      `DEMO SAFETY VIOLATION: Database target "${dbUrl || dbName || 'unknown'}" does not appear to be a designated floodrelay/demo/test database. Must contain one of: ${allowedPatterns.join(', ')}. Failing closed.`,
    );
  }
}

export async function runDemoCleanup(): Promise<{
  deletedStops: number;
  deletedAssignments: number;
  deletedOperationalEvents: number;
  deletedAuditEvents: number;
  deletedBlockedZones: number;
  deletedRequests: number;
  deletedResources: number;
  deletedShelters: number;
}> {
  verifyDemoDatabaseSafety();
  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete assignment stops for demo assignments
      const stopsRes = await client.query(`
        DELETE FROM assignment_stops
        WHERE assignment_id IN (
          SELECT id FROM assignments WHERE scenario_id = 'scenario-demo-yamuna-2026'
        )
      `);

      // 2. Delete demo assignments
      const assignmentsRes = await client.query(`
        DELETE FROM assignments
        WHERE scenario_id = 'scenario-demo-yamuna-2026'
      `);

      // 3. Delete demo operational events
      const opEventsRes = await client.query(`
        DELETE FROM operational_events
        WHERE entity_id LIKE 'demo-%' OR correlation_id LIKE 'demo-%'
      `);

      // 4. Delete demo audit events
      const auditRes = await client.query(`
        DELETE FROM audit_events
        WHERE entity_id LIKE 'demo-%' OR actor = 'demo_operator'
      `);

      // 5. Delete demo blocked zones
      const zonesRes = await client.query(`
        DELETE FROM blocked_zones
        WHERE id LIKE 'demo-zone-%'
      `);

      // 6. Delete demo requests (and duplicate relations)
      const reqRes = await client.query(`
        DELETE FROM requests
        WHERE id LIKE 'demo-req-%' OR id LIKE 'demo-walkthrough-%'
      `);

      // 7. Delete demo resources
      const resRes = await client.query(`
        DELETE FROM resources
        WHERE id LIKE 'demo-res-%'
      `);

      // 8. Delete demo shelters
      const shelterRes = await client.query(`
        DELETE FROM shelters
        WHERE id LIKE 'demo-shelter-%'
      `);

      await client.query('COMMIT');

      const results = {
        deletedStops: stopsRes.rowCount ?? 0,
        deletedAssignments: assignmentsRes.rowCount ?? 0,
        deletedOperationalEvents: opEventsRes.rowCount ?? 0,
        deletedAuditEvents: auditRes.rowCount ?? 0,
        deletedBlockedZones: zonesRes.rowCount ?? 0,
        deletedRequests: reqRes.rowCount ?? 0,
        deletedResources: resRes.rowCount ?? 0,
        deletedShelters: shelterRes.rowCount ?? 0,
      };

      console.log('--- FloodRelay Demo Cleanup Completed ---');
      console.log(`- Assignment Stops removed:    ${results.deletedStops}`);
      console.log(`- Assignments removed:         ${results.deletedAssignments}`);
      console.log(`- Operational Events removed:  ${results.deletedOperationalEvents}`);
      console.log(`- Audit Events removed:        ${results.deletedAuditEvents}`);
      console.log(`- Blocked Zones removed:       ${results.deletedBlockedZones}`);
      console.log(`- Rescue Requests removed:     ${results.deletedRequests}`);
      console.log(`- Fleet Resources removed:     ${results.deletedResources}`);
      console.log(`- Shelters removed:            ${results.deletedShelters}`);

      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await closePool();
  }
}

// Execute when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDemoCleanup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Demo cleanup failed:', err);
      process.exit(1);
    });
}
