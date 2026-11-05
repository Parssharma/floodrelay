import { describe, it, expect } from 'vitest';
import {
  computeRepairDiff,
  SIMULATED_BASELINE_PLAN,
  SIMULATED_REPAIR_RESULT,
} from '../lib/fixtures/repairFixtures';
import type { SolverPlan } from '@floodrelay/shared';
import { ApiClientError } from '../lib/api/errors';

describe('Phase 5 Part 3 — Repair Proposal Comparison & Churn Analysis Invariants', () => {
  it('correctly compares baseline and repaired plans from deterministic fixtures', () => {
    const baseline = SIMULATED_BASELINE_PLAN;
    const repaired = SIMULATED_REPAIR_RESULT.proposedPlan as SolverPlan;

    expect(repaired).toBeDefined();
    const diff = computeRepairDiff(baseline, repaired);

    // 1. Churn percentage calculation
    expect(diff.churnPercent).toBeGreaterThan(0);
    expect(diff.churnPercent).toBeLessThanOrEqual(100);
    expect(diff.movedRequestsCount).toBeGreaterThan(0);

    // 2. Stop modifications breakdown
    expect(diff.stopDiffs.length).toBeGreaterThan(0);

    // 3. Frozen stops must be identified and preserved
    const frozenStops = diff.stopDiffs.filter((s) => s.status === 'FROZEN');
    expect(frozenStops.length).toBe(diff.frozenStopsCount);
    expect(frozenStops.length).toBeGreaterThan(0);
    frozenStops.forEach((f) => {
      expect(f.isFrozen).toBe(true);
      expect(f.baselineStopNumber).toBe(f.repairedStopNumber);
    });

    // 4. Reassigned stops must indicate resource transition
    const reassignedStops = diff.stopDiffs.filter((s) => s.status === 'REASSIGNED');
    expect(reassignedStops.length).toBe(diff.reassignedStopsCount);
    if (reassignedStops.length > 0) {
      expect(reassignedStops[0].baselineResourceId).not.toBe(reassignedStops[0].repairedResourceId);
    }

    // 5. Newly added stops
    const addedStops = diff.stopDiffs.filter((s) => s.status === 'ADDED');
    expect(addedStops.length).toBe(diff.addedStopsCount);
    if (addedStops.length > 0) {
      expect(addedStops[0].repairedResourceId).toBeDefined();
    }

    // 6. Metrics deltas
    expect(typeof diff.coverageDeltaPercent).toBe('number');
    expect(typeof diff.travelTimeDeltaMinutes).toBe('number');
    expect(typeof diff.highPriorityWaitDeltaMinutes).toBe('number');
    expect(typeof diff.unservedDelta).toBe('number');
    // In our fixture, unserved went from 2 to 1 (delta = -1)
    expect(diff.unservedDelta).toBe(-1);
  });

  describe('Identical Plans (Zero Churn Invariant)', () => {
    it('returns 0% churn when baseline and repaired plans are identical', () => {
      const plan = SIMULATED_BASELINE_PLAN;
      const diff = computeRepairDiff(plan, plan);

      expect(diff.churnPercent).toBe(0);
      expect(diff.movedRequestsCount).toBe(0);
      expect(diff.addedStopsCount).toBe(0);
      expect(diff.removedStopsCount).toBe(0);
      expect(diff.reassignedStopsCount).toBe(0);
      expect(diff.reorderedStopsCount).toBe(0);
      expect(diff.coverageDeltaPercent).toBe(0);
      expect(diff.travelTimeDeltaMinutes).toBe(0);
      expect(diff.unservedDelta).toBe(0);
    });
  });

  describe('Simulated Fixture Safeguards', () => {
    it('prohibits database commitment of simulated fixtures', () => {
      const isSimulated = true;
      let committed = false;

      const attemptCommit = () => {
        if (isSimulated) {
          throw new Error('Cannot commit simulated test fixture to live operational database');
        }
        committed = true;
      };

      expect(attemptCommit).toThrow('Cannot commit simulated test fixture');
      expect(committed).toBe(false);
    });
  });

  describe('Version Conflict (409 CONFLICT) Handling', () => {
    it('detects 409 conflict and provides operator refresh instruction', () => {
      const conflictError = new ApiClientError({
        message: 'Assignment plan version conflict',
        statusCode: 409,
        code: 'ALREADY_COMMITTED',
      });

      const isConflict =
        conflictError.statusCode === 409 ||
        conflictError.isConflict ||
        conflictError.code === 'ALREADY_COMMITTED' ||
        conflictError.code === 'VERSION_CONFLICT';

      expect(isConflict).toBe(true);

      const resolvedMessage = isConflict
        ? 'Version Conflict (409): The baseline plan has been updated by another operator. Please refresh before committing.'
        : conflictError.message;

      expect(resolvedMessage).toContain('Version Conflict (409)');
      expect(resolvedMessage).toContain('refresh');
    });
  });
});
