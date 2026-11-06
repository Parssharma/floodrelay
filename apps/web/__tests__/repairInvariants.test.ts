import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import RepairComparison from '../components/operator/repair/RepairComparison';
import RepairMetrics from '../components/operator/repair/RepairMetrics';
import ChurnSummary from '../components/operator/repair/ChurnSummary';
import { SIMULATED_REPAIR_RESULT } from '../lib/fixtures/repairFixtures';

// Mock OperatorAuthContext
vi.mock('@/lib/auth/OperatorAuthContext', () => ({
  useOperatorAuth: () => ({
    operator: {
      id: 'op-dispatcher-1',
      username: 'lead_dispatcher',
      role: 'DISPATCHER',
    },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

describe('Phase 5 Part 3 — Repair Comparison Invariants & Decision Support Guardrails', () => {
  it('displays explicit Baseline Plan Not Available message when baseline plan is missing', () => {
    const html = renderToString(
      React.createElement(RepairComparison, {
        baselinePlan: null,
        repairResult: SIMULATED_REPAIR_RESULT,
        isSimulated: false,
      }),
    );

    expect(html).toContain('Baseline Plan Not Available — Cannot compute comparative churn.');
    expect(html).toContain(
      'A baseline operational plan is required to calculate stop differences, passenger movement, and schedule churn.',
    );
  });

  it('renders "Not available" in RepairMetrics when metric fields are undefined', () => {
    const html = renderToString(
      React.createElement(RepairMetrics, {
        baselineMetrics: undefined,
        repairedMetrics: undefined,
      }),
    );

    expect(html).toContain('Not available');
  });

  it('renders "Not available" in ChurnSummary when churn percent is NaN or undefined', () => {
    const html = renderToString(
      React.createElement(ChurnSummary, {
        churnPercent: NaN,
        movedRequestsCount: 0,
        addedStopsCount: 0,
        removedStopsCount: 0,
        reassignedStopsCount: 0,
        reorderedStopsCount: 0,
        frozenStopsCount: 0,
        unchangedStopsCount: 0,
      }),
    );

    expect(html).toContain('Not available');
    expect(html).toContain('Metric not available');
  });

  it('displays the decision support disclaimer in RepairComparison', () => {
    const html = renderToString(
      React.createElement(RepairComparison, {
        isSimulated: true,
      }),
    );

    expect(html).toContain('Decision Support Only:');
    expect(html).toContain(
      'Authorizing plan commitment records decisions in the database. It does not initiate automated physical vehicle dispatch.',
    );
  });

  it('strictly disables plan commitment for simulated fixtures', () => {
    const html = renderToString(
      React.createElement(RepairComparison, {
        isSimulated: true,
      }),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('Commitment disabled for test fixtures');
  });
});
