import { describe, it, expect } from 'vitest';
import { SIMULATED_REQUESTS } from '../lib/fixtures/requests';
import { SIMULATED_RESOURCES, SIMULATED_SHELTERS } from '../lib/fixtures/resources';
import { SIMULATED_ASSIGNMENTS } from '../lib/fixtures/assignments';
import { SIMULATED_DASHBOARD_METRICS } from '../lib/fixtures/metrics';

describe('Frontend Deterministic Fixtures', () => {
  it('provides valid simulated requests with proper geospatial coordinates', () => {
    expect(SIMULATED_REQUESTS.length).toBeGreaterThan(0);
    for (const req of SIMULATED_REQUESTS) {
      expect(req.id).toMatch(/^req_/);
      expect(req.lat).toBeGreaterThanOrEqual(29.0);
      expect(req.lat).toBeLessThanOrEqual(30.5);
      expect(req.lng).toBeGreaterThanOrEqual(-96.0);
      expect(req.lng).toBeLessThanOrEqual(-94.5);
      expect(req.peopleCount).toBeGreaterThan(0);
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(req.urgency);
      expect(['PENDING', 'ASSIGNED', 'COMMITTED', 'IN_TRANSIT', 'RESCUED', 'CANCELLED']).toContain(
        req.status,
      );
    }
  });

  it('provides valid simulated resources with capacities and status', () => {
    expect(SIMULATED_RESOURCES.length).toBeGreaterThan(0);
    for (const res of SIMULATED_RESOURCES) {
      expect(res.id).toBeTruthy();
      expect(res.capacity).toBeGreaterThan(0);
      expect(['BOAT', 'HIGH_WATER_VEHICLE', 'HELICOPTER', 'HOVERCRAFT']).toContain(res.type);
      expect(['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'OFFLINE']).toContain(res.status);
    }
  });

  it('provides valid simulated shelters with max and current occupancies', () => {
    expect(SIMULATED_SHELTERS.length).toBeGreaterThan(0);
    for (const shelter of SIMULATED_SHELTERS) {
      expect(shelter.id).toBeTruthy();
      expect(shelter.capacity).toBeGreaterThan(0);
      expect(shelter.currentOccupancy).toBeGreaterThanOrEqual(0);
      expect(shelter.currentOccupancy).toBeLessThanOrEqual(shelter.capacity);
    }
  });

  it('provides valid simulated assignment proposals and committed plans', () => {
    expect(SIMULATED_ASSIGNMENTS.length).toBeGreaterThanOrEqual(2);

    const proposed = SIMULATED_ASSIGNMENTS.find((a) => a.status === 'PROPOSED');
    expect(proposed).toBeDefined();
    expect(proposed?.metrics).toBeDefined();
    expect(proposed?.metrics?.coveragePercent).toBeGreaterThan(0);

    const committed = SIMULATED_ASSIGNMENTS.find((a) => a.status === 'COMMITTED');
    expect(committed).toBeDefined();
    expect(committed?.committedBy).toBeTruthy();
    expect(committed?.committedAt).toBeTruthy();
  });

  it('provides operational metrics with valid triage and fleet numbers', () => {
    expect(SIMULATED_DASHBOARD_METRICS.pendingRequestsCount).toBeGreaterThan(0);
    expect(SIMULATED_DASHBOARD_METRICS.criticalRequestsCount).toBeGreaterThan(0);
    expect(SIMULATED_DASHBOARD_METRICS.urgentRequestsCount).toBeGreaterThan(0);
    expect(SIMULATED_DASHBOARD_METRICS.activeFleetCount).toBeGreaterThan(0);
    expect(SIMULATED_DASHBOARD_METRICS.totalFleetCount).toBeGreaterThan(0);
  });
});
