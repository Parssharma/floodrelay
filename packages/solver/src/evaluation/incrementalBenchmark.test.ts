import { describe, expect, it } from 'vitest';
import {
  evaluateIncrementalStrategiesOnCase,
  formatIncrementalMarkdownTable,
  INCREMENTAL_SIZE_SMALL,
} from './incrementalBenchmark.js';

describe('Incremental Strategy Benchmark Harness', () => {
  it('benchmarks all three strategies on small scenario and generates deterministic table', () => {
    // Run 2 deterministic seeds for fast CI execution
    const summaries = evaluateIncrementalStrategiesOnCase(INCREMENTAL_SIZE_SMALL, 2, 100);

    expect(summaries.length).toBe(3);

    const localRepairSummary = summaries.find((s) => s.strategy === 'Event-Triggered Local Repair');
    const fullResolveSummary = summaries.find(
      (s) => s.strategy === 'Full Re-solve (Cluster-Allocation)',
    );
    const periodicSummary = summaries.find(
      (s) => s.strategy === 'Insertion + Periodic Reopt (k=5)',
    );

    expect(localRepairSummary).toBeDefined();
    expect(fullResolveSummary).toBeDefined();
    expect(periodicSummary).toBeDefined();

    // Invariant: Event-Triggered Local Repair strictly preserves all frozen stops (0 violations)
    expect(localRepairSummary!.frozenViolationsTotal).toBe(0);

    // Event-Triggered Local Repair has lower or equal cumulative churn than Full Re-solve
    expect(localRepairSummary!.cumulativeChurnMean).toBeLessThanOrEqual(
      fullResolveSummary!.cumulativeChurnMean,
    );

    const markdownTable = formatIncrementalMarkdownTable(summaries);
    expect(markdownTable).toContain('Event-Triggered Local Repair');
    expect(markdownTable).toContain('Full Re-solve (Cluster-Allocation)');
  });
});
