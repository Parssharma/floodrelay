import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '@floodrelay/shared';
import {
  getPool,
  closePool,
  runMigrationsUp,
  PostgisRepository,
  AuthService,
  AssignmentService,
  OperationalEventService,
  RepairOrchestrationService,
  IncrementalRepairSolverAdapter,
} from '@floodrelay/api';
import { verifyDemoDatabaseSafety } from './cleanupDemo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export async function runDemoSetup(): Promise<{
  scenarioId: string;
  baselineAssignmentId: string;
  repairedProposalId: string;
  disruptionEventId: string;
  frozenStopsCount: number;
  churnRate: number;
}> {
  console.log('===============================================================');
  console.log('🌊 FloodRelay — End-to-End Demonstration Environment Setup');
  console.log('===============================================================');

  // Step 1: Safety & Environment Verification
  verifyDemoDatabaseSafety();
  console.log('✔ Database safety guard passed: non-production target verified.');

  const pool = getPool();
  try {
    // Step 2: Ensure schema migrations are applied
    console.log('Applying database migrations up to latest...');
    await runMigrationsUp(pool);
    console.log('✔ Migrations verified.');

    const repo = new PostgisRepository(pool);
    const authService = new AuthService(repo);
    const eventService = new OperationalEventService(repo);
    const repairSolver = new IncrementalRepairSolverAdapter(repo);
    const repairService = new RepairOrchestrationService(repo, repairSolver);
    const assignmentService = new AssignmentService(repo);

    // Step 3: Clean prior demo artifacts for idempotent setup
    console.log('Cleaning previous demo state if present...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        DELETE FROM assignment_stops
        WHERE assignment_id IN (
          SELECT id FROM assignments WHERE scenario_id = 'scenario-demo-yamuna-2026'
        )
      `);
      await client.query(`
        DELETE FROM assignments WHERE scenario_id = 'scenario-demo-yamuna-2026'
      `);
      await client.query(`
        DELETE FROM operational_events WHERE entity_id LIKE 'demo-%' OR correlation_id LIKE 'demo-%'
      `);
      await client.query(`
        DELETE FROM audit_events WHERE entity_id LIKE 'demo-%'
      `);
      await client.query(`
        DELETE FROM blocked_zones WHERE id LIKE 'demo-zone-%'
      `);
      await client.query(`
        DELETE FROM requests WHERE id LIKE 'demo-req-%' OR id LIKE 'demo-walkthrough-%'
      `);
      await client.query(`
        DELETE FROM resources WHERE id LIKE 'demo-res-%'
      `);
      await client.query(`
        DELETE FROM shelters WHERE id LIKE 'demo-shelter-%'
      `);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    console.log('✔ Clean slate established.');

    // Step 4: Seed deterministic demo scenario
    const scenarioPath = path.resolve(__dirname, '../../scenarios/demo-yamuna-scenario.json');
    if (!fs.existsSync(scenarioPath)) {
      throw new Error(`Demo scenario file not found at: ${scenarioPath}`);
    }
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Scenario;
    console.log(`Seeding demo scenario: "${scenario.metadata.name}" (${scenario.id})...`);
    const seedResult = await repo.loadScenario(scenario);
    console.log(
      `✔ Scenario loaded: ${seedResult.requestsCount} requests, ${seedResult.resourcesCount} resources, ${seedResult.sheltersCount} shelters (labeled SIMULATED).`,
    );

    // Step 5: Provision demonstration operator account
    const demoUsername = 'demo_operator';
    const demoPassword = 'DemoOperator2026!';
    const existingOp = await repo.getOperatorByUsername(demoUsername);
    if (!existingOp) {
      await authService.createOperator({
        username: demoUsername,
        password: demoPassword,
        name: 'Lead Disaster Operations Officer',
        role: 'ADMIN',
      });
      console.log(`✔ Provisioned demonstration operator: "${demoUsername}" (Role: ADMIN).`);
    } else {
      console.log(`✔ Demonstration operator "${demoUsername}" verified.`);
    }

    // Step 6: Propose baseline assignment
    console.log('Generating initial baseline rescue proposal (algorithm: savings)...');
    const baseline = await assignmentService.proposeAssignment({
      scenarioId: scenario.id,
      algorithm: 'savings',
    });
    console.log(`✔ Baseline proposal created: ID = ${baseline.id}`);

    // Step 7: Commit baseline assignment (human operator commitment -> stops frozen)
    console.log('Operator committing baseline assignment (freezing mission stops)...');
    const commitSuccess = await assignmentService.commitAssignment(baseline.id, {
      operatorId: demoUsername,
      notes: 'Baseline Yamuna disaster relief deployment plan committed by demo operator.',
    });
    if (!commitSuccess) {
      throw new Error(`Failed to commit baseline assignment "${baseline.id}"`);
    }

    const committedAssignment = await repo.getAssignment(baseline.id);
    const frozenStops = committedAssignment?.stops.filter((s) => s.is_frozen) ?? [];
    console.log(
      `✔ Baseline committed: status = ${committedAssignment?.assignment.status}, frozen stops = ${frozenStops.length}.`,
    );

    // Step 8: Inject operational disruptions
    // A. Resource offline disruption
    console.log('Injecting operational disruption 1: Craft engine failure (RESOURCE_OFFLINE)...');
    const offlineResource = await repo.updateResourceStatus('demo-res-boat-01', 'OFFLINE');
    if (!offlineResource) {
      throw new Error('Could not find resource demo-res-boat-01 to mark OFFLINE');
    }

    const disruptionEvent = await eventService.recordEvent({
      id: `evt-demo-disrupt-${Date.now().toString().slice(-4)}`,
      type: 'RESOURCE_OFFLINE',
      entityType: 'RESOURCE',
      entityId: 'demo-res-boat-01',
      actorId: demoUsername,
      actorType: 'OPERATOR',
      payload: {
        resourceId: 'demo-res-boat-01',
        previousStatus: 'AVAILABLE',
        newStatus: 'OFFLINE',
        reason: 'Outboard motor flooded in high-turbidity debris water near Old Railway Bridge',
      },
    });
    console.log(`✔ Recorded disruption event: ID = ${disruptionEvent.event.id} (RESOURCE_OFFLINE)`);

    // B. Road blockage hazard
    console.log('Injecting operational disruption 2: Submerged underpass (ROAD_BLOCKED)...');
    const blockedZone = await repo.insertBlockedZone({
      id: 'demo-zone-submerged-bypass',
      name: 'Ring Road Submerged Underpass',
      severity: 'BLOCKED',
      polygon: [
        { lat: 28.662, lng: 77.24 },
        { lat: 28.665, lng: 77.245 },
        { lat: 28.661, lng: 77.247 },
        { lat: 28.658, lng: 77.242 },
      ],
      createdBy: demoUsername,
    });
    await eventService.recordEvent({
      id: `evt-demo-hazard-${Date.now().toString().slice(-4)}`,
      type: 'ROAD_BLOCKED',
      entityType: 'ROAD_ZONE',
      entityId: blockedZone.id,
      actorId: demoUsername,
      actorType: 'OPERATOR',
      payload: {
        zoneId: blockedZone.id,
        name: blockedZone.name,
        severity: blockedZone.severity,
      },
    });
    console.log(`✔ Recorded hazard zone: ID = ${blockedZone.id} (ROAD_BLOCKED)`);

    // Step 9: Incremental plan repair
    console.log('Invoking incremental repair orchestration with frozen stop preservation...');
    const repairResult = await repairService.orchestrateRepair(disruptionEvent.event.id, {
      baselineAssignmentId: baseline.id,
    });

    console.log(`✔ Incremental repair complete:`);
    console.log(`  - Status:                   ${repairResult.status}`);
    console.log(`  - Repaired Proposal ID:     ${repairResult.proposalId ?? 'N/A'}`);
    console.log(`  - Frozen Stops Violated:    ${repairResult.churn?.frozenStopsViolated ?? 0}`);
    console.log(
      `  - Reassigned Requests:      ${repairResult.churn?.reassignedRequestsCount ?? 0}`,
    );
    console.log(`  - Route Churn Score:        ${repairResult.churn?.churnRate ?? 0}`);

    if ((repairResult.churn?.frozenStopsViolated ?? 0) > 0) {
      throw new Error('SAFETY VIOLATION: Repair violated committed frozen stops!');
    }

    // Step 10: Print interactive demonstration guide
    console.log('\n===============================================================');
    console.log('🎉 FloodRelay Demonstration System Ready for Presentation');
    console.log('===============================================================');
    console.log('\nOperator Credentials:');
    console.log(`  Username: ${demoUsername}`);
    console.log(`  Password: ${demoPassword}`);
    console.log('\nInteractive Web Applications:');
    console.log('  1. Citizen Distress Intake:   http://localhost:3000/citizen/request');
    console.log('  2. Operator Command Portal:   http://localhost:3000/operator');
    console.log('  3. Tactical GIS Live Map:     http://localhost:3000/operator/map');
    console.log('  4. Operational Audit Log:     http://localhost:3000/operator/audit');
    console.log('  5. Platform Limitations:      http://localhost:3000/limitations');
    console.log('\nBackend Health & Specifications:');
    console.log('  - API Health:                 http://localhost:3000/health');
    console.log('  - OpenAPI Specification:      http://localhost:3000/openapi.json');
    console.log('  - River Forecast Context:     http://localhost:3000/forecast/context');
    console.log('\nCleanup Command:');
    console.log('  npm run demo:cleanup\n');

    return {
      scenarioId: scenario.id,
      baselineAssignmentId: baseline.id,
      repairedProposalId: repairResult.proposalId ?? '',
      disruptionEventId: disruptionEvent.event.id,
      frozenStopsCount: frozenStops.length,
      churnRate: repairResult.churn?.churnRate ?? 0,
    };
  } finally {
    await closePool();
  }
}

// Execute when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDemoSetup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Demo setup failed:', err);
      process.exit(1);
    });
}
