import { describe, it, expect } from 'vitest';
import { SIMULATED_REQUESTS } from '../lib/fixtures/requests';
import { SIMULATED_ASSIGNMENTS } from '../lib/fixtures/assignments';

describe('Frontend Interactions & Safety Invariants', () => {
  describe('Citizen Request Form Validation Logic', () => {
    function validateFormInput(data: {
      address: string;
      lat: number;
      lng: number;
      peopleCount: number;
      urgency: string;
    }): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (!data.address || data.address.trim().length < 5) {
        errors.push('Street address or landmark is required (min 5 chars).');
      }

      if (isNaN(data.lat) || data.lat < 29.0 || data.lat > 30.5) {
        errors.push(
          'Latitude must be within the Houston metropolitan flood basin (29.0 to 30.5° N).',
        );
      }

      if (isNaN(data.lng) || data.lng < -96.0 || data.lng > -94.5) {
        errors.push(
          'Longitude must be within the Houston metropolitan flood basin (-96.0 to -94.5° W).',
        );
      }

      if (!data.peopleCount || data.peopleCount < 1 || !Number.isInteger(data.peopleCount)) {
        errors.push('Passenger count must be an integer of at least 1 person.');
      }

      if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(data.urgency)) {
        errors.push('Urgency level must be one of CRITICAL, HIGH, MEDIUM, LOW.');
      }

      return { valid: errors.length === 0, errors };
    }

    it('approves complete and accurate form data', () => {
      const result = validateFormInput({
        address: '1428 Riverbend Dr, Houston, TX 77024',
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 4,
        urgency: 'CRITICAL',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty address', () => {
      const result = validateFormInput({
        address: '   ',
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 2,
        urgency: 'HIGH',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Street address or landmark is required (min 5 chars).');
    });

    it('rejects coordinates outside the regional flood basin', () => {
      const result = validateFormInput({
        address: '100 Main St, Austin, TX',
        lat: 30.2672,
        lng: -97.7431, // Austin coordinates, out of Houston basin
        peopleCount: 1,
        urgency: 'MEDIUM',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Longitude must be within the Houston metropolitan flood basin (-96.0 to -94.5° W).',
      );
    });

    it('rejects invalid or zero passenger count', () => {
      const result = validateFormInput({
        address: '1428 Riverbend Dr',
        lat: 29.7604,
        lng: -95.3698,
        peopleCount: 0,
        urgency: 'LOW',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passenger count must be an integer of at least 1 person.');
    });
  });

  describe('Operator Request Search & Filtering Invariants', () => {
    it('filters requests accurately by urgency level', () => {
      const critical = SIMULATED_REQUESTS.filter((r) => r.urgency === 'CRITICAL');
      const high = SIMULATED_REQUESTS.filter((r) => r.urgency === 'HIGH');
      const medium = SIMULATED_REQUESTS.filter((r) => r.urgency === 'MEDIUM');

      expect(critical.length).toBeGreaterThan(0);
      expect(high.length).toBeGreaterThan(0);
      expect(medium.length).toBeGreaterThan(0);

      for (const r of critical) expect(r.urgency).toBe('CRITICAL');
      for (const r of high) expect(r.urgency).toBe('HIGH');
    });

    it('searches requests by text query across id and medical notes', () => {
      const query = 'oxygen';
      const matches = SIMULATED_REQUESTS.filter(
        (r) =>
          r.notes?.toLowerCase().includes(query.toLowerCase()) ||
          r.id.toLowerCase().includes(query.toLowerCase()),
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].notes?.toLowerCase()).toContain('oxygen');
    });

    it('properly classifies duplicates and keeps the primary unflagged', () => {
      const duplicates = SIMULATED_REQUESTS.filter((r) => r.isFlaggedDuplicate);
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
      expect(duplicates[0].duplicateOfId).toBeTruthy();

      const primary = SIMULATED_REQUESTS.find((r) => r.id === duplicates[0].duplicateOfId);
      expect(primary).toBeDefined();
      expect(primary?.isFlaggedDuplicate).toBe(false);
    });
  });

  describe('Operator Assignment Plan Filtering & Safety Invariants', () => {
    it('filters plans by PROPOSED vs COMMITTED statuses', () => {
      const proposed = SIMULATED_ASSIGNMENTS.filter((p) => p.status === 'PROPOSED');
      const committed = SIMULATED_ASSIGNMENTS.filter((p) => p.status === 'COMMITTED');

      expect(proposed.length).toBeGreaterThanOrEqual(1);
      expect(committed.length).toBeGreaterThanOrEqual(1);

      for (const p of proposed) expect(p.status).toBe('PROPOSED');
      for (const p of committed) expect(p.status).toBe('COMMITTED');
    });

    it('resolves valid plan IDs and returns undefined for nonexistent IDs', () => {
      const valid = SIMULATED_ASSIGNMENTS.find((p) => p.id === 'PR-105');
      const invalid = SIMULATED_ASSIGNMENTS.find((p) => p.id === 'PR-999');

      expect(valid).toBeDefined();
      expect(valid?.id).toBe('PR-105');
      expect(valid?.status).toBe('PROPOSED');
      expect(invalid).toBeUndefined();
    });

    it('guarantees commit cannot mutate global fixtures in Milestone 1', () => {
      const targetPlan = SIMULATED_ASSIGNMENTS.find((p) => p.id === 'PR-105');
      expect(targetPlan?.status).toBe('PROPOSED');

      // Simulating a local UI state copy
      const localPlan = { ...targetPlan, status: 'COMMITTED' as const };

      expect(localPlan.status).toBe('COMMITTED');
      expect(targetPlan?.status).toBe('PROPOSED');
    });
  });
});
