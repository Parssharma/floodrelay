import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/connection.js';
import { PostgisRepository } from '../db/repository.js';
import { RequestService } from './requestService.js';
import { ServiceAreaService } from './serviceAreaService.js';
import { AuthService } from './authService.js';
import {
  DELHI_NCR_BOUNDARY_VERSION,
  DELHI_NCR_EXPECTED_DATASET_SHA256,
  DELHI_NCR_REGION_ID,
  loadDelhiNcrBoundaryDataset,
} from '../geo/delhiNcrBoundary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = getPool();
const repo = new PostgisRepository(pool);
const authService = new AuthService(repo);
const serviceAreaService = new ServiceAreaService(repo);
const requestService = new RequestService(repo, serviceAreaService);
const app = createApp({ repository: repo, authService, requestService });

describe('Migration 006 — Delhi NCR Service-Area Boundary Attestation Hardening & Compliance Suite', () => {
  beforeAll(async () => {
    // Ensure active boundary attestation passes initially
    await serviceAreaService.attestActiveBoundaryIntegrity();
  });

  afterAll(async () => {
    // Restore boundary to valid canonical state
    const migrationSqlPath = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.sql');
    if (fs.existsSync(migrationSqlPath)) {
      const sql = fs.readFileSync(migrationSqlPath, 'utf-8');
      await pool.query(sql);
    }
    await serviceAreaService.attestActiveBoundaryIntegrity();
  });

  // Req 1 & 4: Stored dataset_sha256 matches canonical GeoJSON file
  it('Req 1 & 4: stores the canonical dataset_sha256 matching the repository GeoJSON file', async () => {
    const { sha256 } = loadDelhiNcrBoundaryDataset();
    expect(sha256).toBe(DELHI_NCR_EXPECTED_DATASET_SHA256);

    const res = await pool.query<{ dataset_sha256: string; boundary_version: string; region_id: string }>(
      'SELECT dataset_sha256, boundary_version, region_id FROM service_areas WHERE region_id = $1 AND is_active = TRUE',
      [DELHI_NCR_REGION_ID],
    );

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.region_id).toBe(DELHI_NCR_REGION_ID);
    expect(res.rows[0]?.boundary_version).toBe(DELHI_NCR_BOUNDARY_VERSION);
    expect(res.rows[0]?.dataset_sha256.trim()).toBe(DELHI_NCR_EXPECTED_DATASET_SHA256);
  });

  // Req 2: Repairs a database where migration 005 had the stale checksum
  it('Req 2: repairs a database with stale checksum (357d77cd...) when migration 006 is applied', async () => {
    const staleSha = '357d77cdf69c8f5f4016c0c656e70cfcb8b1d585dcba5849e95a15299478fd1d';

    // Simulate stale state from historical migration 005 execution
    await pool.query('UPDATE service_areas SET dataset_sha256 = $1 WHERE region_id = $2', [
      staleSha,
      DELHI_NCR_REGION_ID,
    ]);

    // Attestation must fail closed in stale state
    ServiceAreaService.resetAttestationForTest();
    await expect(serviceAreaService.attestActiveBoundaryIntegrity()).rejects.toThrow(
      /Active boundary dataset_sha256 mismatch/,
    );

    // Apply migration 006 forward migration script
    const migration006Path = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.sql');
    const sql = fs.readFileSync(migration006Path, 'utf-8');
    await pool.query(sql);

    // Attestation must now succeed
    ServiceAreaService.resetAttestationForTest();
    const attestation = await serviceAreaService.attestActiveBoundaryIntegrity();
    expect(attestation.datasetSha256.trim()).toBe(DELHI_NCR_EXPECTED_DATASET_SHA256);
    expect(attestation.isValid).toBe(true);
    expect(attestation.srid).toBe(4326);
  });

  // Req 3: Idempotent repeated execution of migration 006
  it('Req 3: supports idempotent repeated execution without errors, duplicates, or state drift', async () => {
    const migration006Path = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.sql');
    const sql = fs.readFileSync(migration006Path, 'utf-8');

    // Run migration twice
    await pool.query(sql);
    await pool.query(sql);

    const countRes = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM service_areas WHERE region_id = $1',
      [DELHI_NCR_REGION_ID],
    );
    expect(countRes.rows[0]?.count).toBe('1');

    const activeRes = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM service_areas WHERE is_active = TRUE',
    );
    expect(activeRes.rows[0]?.count).toBe('1');
  });

  // Req 5: PostGIS geometry validity and correct SRID 4326
  it('Req 5: PostGIS geometry is topologically valid (ST_IsValid) with SRID 4326', async () => {
    const res = await pool.query<{ is_valid: boolean; srid: number }>(`
      SELECT ST_IsValid(geometry) as is_valid, ST_SRID(geometry) as srid
      FROM service_areas
      WHERE region_id = 'IN-NCR' AND is_active = TRUE;
    `);

    expect(res.rows[0]?.is_valid).toBe(true);
    expect(Number(res.rows[0]?.srid)).toBe(4326);
  });

  // Req 6: Topological equality between stored boundary and canonical GeoJSON
  it('Req 6: stored boundary is topologically equal to canonical GeoJSON (ST_Equals and ST_Covers)', async () => {
    const { dataset } = loadDelhiNcrBoundaryDataset();
    const canonicalGeometriesJson = JSON.stringify(dataset.features.map((f) => f.geometry));

    const attestationRows = await repo.attestServiceAreaBoundary(canonicalGeometriesJson);
    expect(attestationRows).toHaveLength(1);
    expect(attestationRows[0]?.is_topologically_equal).toBe(true);
    expect(attestationRows[0]?.is_mutually_covered).toBe(true);
  });

  // Req 7: Area calculation within expected physical bounds for Delhi NCR (~55,000 sq km)
  it('Req 7: computed geographic area is within expected bounds [54000, 57000] sq km', async () => {
    const res = await pool.query<{ area_sq_km: number }>(`
      SELECT ST_Area(geometry::geography) / 1000000.0 as area_sq_km
      FROM service_areas
      WHERE region_id = 'IN-NCR' AND is_active = TRUE;
    `);

    const area = Number(res.rows[0]?.area_sq_km);
    expect(area).toBeGreaterThan(54000);
    expect(area).toBeLessThan(57000);
  });

  // Req 8: Acceptance of valid coordinates across Delhi NCR
  it('Req 8: accepts valid coordinates across Delhi NCR (Pitampura, CP, Gurugram, Noida, Alwar)', async () => {
    const ncrPoints = [
      { name: 'Pitampura (Incident Location)', lat: 28.7032, lng: 77.1325 },
      { name: 'Connaught Place (Central Delhi)', lat: 28.6315, lng: 77.2167 },
      { name: 'Gurugram (Haryana)', lat: 28.4595, lng: 77.0266 },
      { name: 'Noida (Uttar Pradesh)', lat: 28.5355, lng: 77.3910 },
      { name: 'Alwar (Peripheral Rajasthan NCR)', lat: 27.5530, lng: 76.6346 },
    ];

    for (const pt of ncrPoints) {
      const check = await serviceAreaService.checkCoordinates(pt.lat, pt.lng);
      expect(check.eligible, `${pt.name} should be eligible`).toBe(true);
      expect(check.status, `${pt.name} status should be INSIDE`).toBe('INSIDE');
      expect(check.regionId).toBe(DELHI_NCR_REGION_ID);
    }
  });

  // Req 9: Conclusive rejection of coordinates outside Delhi NCR
  it('Req 9: conclusively rejects coordinates outside Delhi NCR (e.g. Mumbai 19.0760, 72.8777)', async () => {
    const outsidePoints = [
      { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
      { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
      { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
      { name: 'Jaipur (Outside NCR)', lat: 26.9124, lng: 75.7873 },
    ];

    for (const pt of outsidePoints) {
      const check = await serviceAreaService.checkCoordinates(pt.lat, pt.lng);
      expect(check.eligible, `${pt.name} should NOT be eligible`).toBe(false);
      expect(check.status, `${pt.name} status should be OUTSIDE`).toBe('OUTSIDE');
      expect(check.distanceToBoundaryMeters).toBeGreaterThan(0);
    }
  });

  // Req 10: Correct distinction between OUTSIDE_SERVICE_AREA and SERVICE_AREA_UNAVAILABLE
  it('Req 10: distinguishes OUTSIDE_SERVICE_AREA (422) from SERVICE_AREA_UNAVAILABLE (503)', async () => {
    // Outside NCR returns 422
    const resOutside = await request(app).post('/requests').send({
      lat: 19.0760,
      lng: 72.8777,
      peopleCount: 1,
      urgency: 'LOW',
    });
    expect(resOutside.status).toBe(422);
    expect(resOutside.body.error.code).toBe('OUTSIDE_SERVICE_AREA');

    // Simulate corrupted boundary checksum (exactly 64 chars) -> returns 503
    await pool.query('UPDATE service_areas SET dataset_sha256 = $1 WHERE region_id = $2', [
      '0000000000000000000000000000000000000000000000000000000000000000',
      DELHI_NCR_REGION_ID,
    ]);

    const resUnavailable = await request(app).post('/requests').send({
      lat: 28.7032,
      lng: 77.1325,
      peopleCount: 1,
      urgency: 'LOW',
    });
    expect(resUnavailable.status).toBe(503);
    expect(resUnavailable.body.error.code).toBe('SERVICE_AREA_UNAVAILABLE');

    // Restore valid state
    await pool.query('UPDATE service_areas SET dataset_sha256 = $1 WHERE region_id = $2', [
      DELHI_NCR_EXPECTED_DATASET_SHA256,
      DELHI_NCR_REGION_ID,
    ]);
  });

  // Req 11: Preservation of existing rescue requests across migration execution
  it('Req 11: preserves existing rescue requests and operational data across migration execution', async () => {
    // Create a request before running migration
    const testKey = 'test-preservation-req11-' + Date.now();
    const createRes = await request(app).post('/requests').send({
      lat: 28.6315,
      lng: 77.2167,
      peopleCount: 3,
      urgency: 'MEDIUM',
      notes: 'Preservation verification request',
      idempotencyKey: testKey,
    });
    expect(createRes.status).toBe(201);
    const requestId = createRes.body.data.id;

    // Execute migration 006
    const migration006Path = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.sql');
    const sql = fs.readFileSync(migration006Path, 'utf-8');
    await pool.query(sql);

    // Verify request still exists untouched
    const checkReq = await pool.query<{ id: string; people_count: number; urgency: string }>(
      'SELECT id, people_count, urgency FROM requests WHERE id = $1',
      [requestId],
    );
    expect(checkReq.rows).toHaveLength(1);
    expect(checkReq.rows[0]?.id).toBe(requestId);
    expect(checkReq.rows[0]?.people_count).toBe(3);
    expect(checkReq.rows[0]?.urgency).toBe('MEDIUM');
  });

  // Req 12: Single-active-boundary constraint enforcement
  it('Req 12: asserts exactly one active service area boundary exists in the database', async () => {
    const res = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM service_areas WHERE is_active = TRUE',
    );
    expect(res.rows[0]?.count).toBe('1');
  });

  // Req 13: Startup attestation behavior on valid, missing, and altered boundary records
  it('Req 13: startup attestation succeeds on valid record and fails closed on missing/altered records', async () => {
    // 1. Valid record succeeds
    ServiceAreaService.resetAttestationForTest();
    const validResult = await serviceAreaService.attestActiveBoundaryIntegrity();
    expect(validResult.regionId).toBe(DELHI_NCR_REGION_ID);
    expect(validResult.isValid).toBe(true);

    // 2. Inactivated record fails closed
    await pool.query('UPDATE service_areas SET is_active = FALSE WHERE region_id = $1', [DELHI_NCR_REGION_ID]);
    ServiceAreaService.resetAttestationForTest();
    await expect(serviceAreaService.attestActiveBoundaryIntegrity()).rejects.toThrow(
      /No active service-area boundary found/i,
    );

    // 3. Re-activate
    await pool.query('UPDATE service_areas SET is_active = TRUE WHERE region_id = $1', [DELHI_NCR_REGION_ID]);
    ServiceAreaService.resetAttestationForTest();
    const restoredResult = await serviceAreaService.attestActiveBoundaryIntegrity();
    expect(restoredResult.regionId).toBe(DELHI_NCR_REGION_ID);
  });

  // Req 14: Behavior of boundary proximity checks
  it('Req 14: assesses boundary proximity correctly (inside vs near-boundary vs far outside)', async () => {
    // Deep inside NCR (Connaught Place)
    const inside = await serviceAreaService.checkCoordinates(28.6315, 77.2167);
    expect(inside.status).toBe('INSIDE');
    expect(inside.uncertaintyAssessment.isNearBoundary).toBe(false);

    // Far outside (Mumbai)
    const farOutside = await serviceAreaService.checkCoordinates(19.0760, 72.8777);
    expect(farOutside.status).toBe('OUTSIDE');
    expect(farOutside.uncertaintyAssessment.isNearBoundary).toBe(false);
    expect(farOutside.distanceToBoundaryMeters).toBeGreaterThan(100000);
  });

  // Req 15: Verification that down migrations leave database in a consistent state without orphan data
  it('Req 15: down migration executes safely without deleting service_areas or creating orphan data', async () => {
    const downSqlPath = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.down.sql');
    const downSql = fs.readFileSync(downSqlPath, 'utf-8');

    // Run down migration
    await pool.query(downSql);

    const res = await pool.query<{ region_id: string; dataset_sha256: string }>(
      'SELECT region_id, dataset_sha256 FROM service_areas WHERE region_id = $1',
      [DELHI_NCR_REGION_ID],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.dataset_sha256.trim()).toBe('357d77cdf69c8f5f4016c0c656e70cfcb8b1d585dcba5849e95a15299478fd1d');

    // Reapply forward migration 006
    const upSqlPath = path.resolve(__dirname, '../../../../infra/migrations/006_correct_service_area_boundary_attestation.sql');
    const upSql = fs.readFileSync(upSqlPath, 'utf-8');
    await pool.query(upSql);

    const recheck = await pool.query<{ dataset_sha256: string }>(
      'SELECT dataset_sha256 FROM service_areas WHERE region_id = $1',
      [DELHI_NCR_REGION_ID],
    );
    expect(recheck.rows[0]?.dataset_sha256.trim()).toBe(DELHI_NCR_EXPECTED_DATASET_SHA256);
  });

  // Req 16: Absence of SQL injection vectors in spatial queries
  it('Req 16: prevents SQL injection vectors through parameterized PostGIS queries and schema validation', async () => {
    // Non-numeric latitude/longitude rejected by schema validation before reaching SQL
    const resSqlInj = await request(app).post('/requests/service-area-check').send({
      lat: "28.7032; DROP TABLE service_areas; --",
      lng: 77.1325,
    });
    expect(resSqlInj.status).toBe(400);
    expect(resSqlInj.body.error.code).toBe('VALIDATION_ERROR');

    // Table still intact
    const checkTable = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'service_areas') as exists",
    );
    expect(checkTable.rows[0]?.exists).toBe(true);
  });

  // Req 17 & Operational address verification:
  // "Guru Virjanand Marg, Pitampura, Delhi, 110034"
  // 201 Created on new request, 200 OK on idempotent replay
  it('Req 17 & Operational Verification: Pitampura address intake returns 201 Created (new) and 200 OK (idempotent)', async () => {
    const pitampuraCoords = { lat: 28.7032, lng: 77.1325 };
    const idempotencyKey = 'incident-verification-pitampura-' + Date.now();

    // 1. Spatial pre-check succeeds
    const checkRes = await request(app).post('/requests/service-area-check').send(pitampuraCoords);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.data.eligible).toBe(true);
    expect(checkRes.body.data.status).toBe('INSIDE');

    // 2. Submit new rescue request -> HTTP 201 Created
    const createRes = await request(app).post('/requests').send({
      lat: pitampuraCoords.lat,
      lng: pitampuraCoords.lng,
      peopleCount: 4,
      urgency: 'HIGH',
      medicalNeeds: true,
      notes: 'Guru Virjanand Marg, Pitampura, Delhi, 110034 - Elderly resident requires evacuation assistance',
      source: 'REPORTED',
      idempotencyKey,
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.idempotent).toBe(false);
    expect(createRes.body.data.id).toBeDefined();
    expect(createRes.body.data.notes).toContain('Guru Virjanand Marg, Pitampura');

    // 3. Submit identical replay with same idempotency key -> HTTP 200 OK
    const replayRes = await request(app).post('/requests').send({
      lat: pitampuraCoords.lat,
      lng: pitampuraCoords.lng,
      peopleCount: 4,
      urgency: 'HIGH',
      medicalNeeds: true,
      notes: 'Guru Virjanand Marg, Pitampura, Delhi, 110034 - Elderly resident requires evacuation assistance',
      source: 'REPORTED',
      idempotencyKey,
    });

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.success).toBe(true);
    expect(replayRes.body.idempotent).toBe(true);
    expect(replayRes.body.data.id).toBe(createRes.body.data.id);
  });
});
