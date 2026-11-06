import type {
  BlockedZone,
  RescueRequest,
  ResourceRoute,
  Scenario,
  SolverPlan,
} from '@floodrelay/shared';
import { generateScenario } from '../generator.js';
import { solveClusterAllocation } from '../heuristics/clusterAllocation.js';
import { repairIncrementally } from '../incremental/orchestrator.js';
import type { OperationalEvent } from '../incremental/types.js';
import { calculateIncrementalChurn } from '../metrics/churn.js';
import { StraightLineTravelTimeProvider } from '../routing/travelTime.js';

export interface IncrementalBenchmarkCase {
  name: string;
  requestCount: number;
  resourceCount: number;
  shelterCount: number;
  eventsCount: number;
}

export const INCREMENTAL_SIZE_SMALL: IncrementalBenchmarkCase = {
  name: 'Small (20 req / 4 res / 2 sh)',
  requestCount: 20,
  resourceCount: 4,
  shelterCount: 2,
  eventsCount: 6,
};

export const INCREMENTAL_SIZE_MEDIUM: IncrementalBenchmarkCase = {
  name: 'Medium (100 req / 12 res / 3 sh)',
  requestCount: 100,
  resourceCount: 12,
  shelterCount: 3,
  eventsCount: 10,
};

export const INCREMENTAL_SIZE_LARGE: IncrementalBenchmarkCase = {
  name: 'Large (500 req / 30 res / 5 sh)',
  requestCount: 500,
  resourceCount: 30,
  shelterCount: 5,
  eventsCount: 15,
};

export const STANDARD_INCREMENTAL_CASES: readonly IncrementalBenchmarkCase[] = [
  INCREMENTAL_SIZE_SMALL,
  INCREMENTAL_SIZE_MEDIUM,
  INCREMENTAL_SIZE_LARGE,
];

export type RepairStrategy =
  | 'Full Re-solve (Cluster-Allocation)'
  | 'Insertion + Periodic Reopt (k=5)'
  | 'Event-Triggered Local Repair';

export interface StrategyRunMetrics {
  strategy: RepairStrategy;
  caseName: string;
  seed: number;
  coveragePercent: number;
  totalTravelTimeMinutes: number;
  highPriorityWaitMinutes: number;
  totalSolveTimeMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  cumulativeChurn: number;
  newlyUnservedCount: number;
  frozenViolationsCount: number;
  infeasibleRepairsCount: number;
}

export interface IncrementalStrategySummary {
  strategy: RepairStrategy;
  caseName: string;
  seedsRun: number;
  coverageMean: number;
  travelTimeMean: number;
  travelTimeSpread: number;
  highPriorityWaitMean: number;
  totalSolveTimeMsMean: number;
  p50LatencyMsMean: number;
  p95LatencyMsMean: number;
  cumulativeChurnMean: number;
  newlyUnservedMean: number;
  frozenViolationsTotal: number;
  infeasibleRatePercent: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return Number((sorted[idx] ?? 0).toFixed(2));
}

function meanAndStdev(values: number[]): { mean: number; stdev: number } {
  if (values.length === 0) return { mean: 0, stdev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    (values.length > 1 ? values.length - 1 : 1);
  return {
    mean: Number(mean.toFixed(2)),
    stdev: Number(Math.sqrt(variance).toFixed(2)),
  };
}

/**
 * Generates a reproducible sequence of operational events for benchmarking.
 */
export function generateDeterministicEvents(
  initialScenario: Scenario,
  eventsCount: number,
  seed: number,
): OperationalEvent[] {
  const events: OperationalEvent[] = [];
  const bounds = initialScenario.metadata.bounds;

  // Simple pseudo-random generator
  let state = seed;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const urgencies: RescueRequest['urgency'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  for (let i = 0; i < eventsCount; i++) {
    if (i === 1 && initialScenario.resources.length > 2) {
      // One deterministic resource offline event
      const res = initialScenario.resources[1]!;
      events.push({
        id: `evt-offline-${i}`,
        type: 'RESOURCE_OFFLINE',
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        resourceId: res.id,
      });
    } else if (i === 3 && initialScenario.requests.length > 3) {
      // One deterministic cancellation event of an initial mutable request
      const req = initialScenario.requests[2]!;
      events.push({
        id: `evt-cancel-${i}`,
        type: 'REQUEST_CANCELLED',
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        requestId: req.id,
      });
    } else if (i === 4) {
      // One deterministic road blockage event
      const centerLat = (bounds.minLat + bounds.maxLat) / 2;
      const centerLng = (bounds.minLng + bounds.maxLng) / 2;
      const dLat = 0.005;
      const dLng = 0.005;
      const zone: BlockedZone = {
        id: `zone-bench-${seed}-${i}`,
        severity: 'BLOCKED',
        polygon: [
          { lat: centerLat - dLat, lng: centerLng - dLng },
          { lat: centerLat - dLat, lng: centerLng + dLng },
          { lat: centerLat + dLat, lng: centerLng + dLng },
          { lat: centerLat + dLat, lng: centerLng - dLng },
        ],
      };
      events.push({
        id: `evt-blocked-${i}`,
        type: 'ROAD_BLOCKED',
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        blockedZone: zone,
      });
    } else {
      // Request created event
      const lat = bounds.minLat + nextRand() * (bounds.maxLat - bounds.minLat);
      const lng = bounds.minLng + nextRand() * (bounds.maxLng - bounds.minLng);
      const urgency = urgencies[Math.floor(nextRand() * urgencies.length)]!;
      const peopleCount = Math.floor(nextRand() * 4) + 1;

      const newReq: RescueRequest = {
        id: `req-stream-${seed}-${i}`,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        peopleCount,
        urgency,
        createdAt: new Date(Date.now() + i * 60000).toISOString(),
        source: 'SIMULATED',
      };

      events.push({
        id: `evt-req-${i}`,
        type: 'REQUEST_CREATED',
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        request: newReq,
      });
    }
  }

  return events;
}

/**
 * Applies an operational event to evolve a scenario state deterministically.
 */
export function applyEventToScenario(scenario: Scenario, event: OperationalEvent): Scenario {
  if (event.type === 'REQUEST_CREATED') {
    if (!scenario.requests.some((r) => r.id === event.request.id)) {
      return {
        ...scenario,
        requests: [...scenario.requests, event.request],
      };
    }
    return scenario;
  }
  if (event.type === 'RESOURCE_OFFLINE') {
    return {
      ...scenario,
      resources: scenario.resources.map((r) =>
        r.id === event.resourceId ? { ...r, status: 'OFFLINE' } : r,
      ),
    };
  }
  if (event.type === 'REQUEST_CANCELLED') {
    return {
      ...scenario,
      requests: scenario.requests.filter((r) => r.id !== event.requestId),
    };
  }
  if (event.type === 'ROAD_BLOCKED') {
    return {
      ...scenario,
      blockedZones: [...(scenario.blockedZones ?? []), event.blockedZone],
    };
  }
  if (event.type === 'RESOURCE_AVAILABLE') {
    return {
      ...scenario,
      resources: scenario.resources.map((r) =>
        r.id === event.resourceId ? { ...r, status: 'AVAILABLE' } : r,
      ),
    };
  }
  return scenario;
}

/**
 * Runs a single benchmark strategy on a scenario and event sequence.
 */
export function runStrategyBenchmark(
  strategy: RepairStrategy,
  initialScenario: Scenario,
  events: OperationalEvent[],
  seed: number,
  caseName: string,
): StrategyRunMetrics {
  const provider = new StraightLineTravelTimeProvider();

  // 1. Solve initial baseline plan
  const baselinePlan = solveClusterAllocation(initialScenario, {
    travelTimeProvider: provider,
  });

  // 2. Freeze genuine committed PICKUP/DROPOFF stops in the baseline plan
  const frozenBaselineRoutes: ResourceRoute[] = baselinePlan.routes.map((route) => {
    if (route.stops.length === 0) return route;
    const firstPickupIdx = route.stops.findIndex((s) => s.type === 'PICKUP');
    if (firstPickupIdx === -1) return route;
    const firstDropoffIdx = route.stops.findIndex(
      (s, idx) => idx > firstPickupIdx && s.type === 'DROPOFF',
    );
    const endFreezeIdx = firstDropoffIdx !== -1 ? firstDropoffIdx : firstPickupIdx;
    const newStops = route.stops.map((stop, idx) =>
      idx <= endFreezeIdx ? { ...stop, isFrozen: true } : stop,
    );
    return { ...route, stops: newStops };
  });

  let currentPlan: SolverPlan = {
    ...baselinePlan,
    routes: frozenBaselineRoutes,
  };
  let currentScenario: Scenario = { ...initialScenario };

  let cumulativeChurn = 0;
  let newlyUnservedCount = 0;
  let frozenViolationsCount = 0;
  let infeasibleRepairsCount = 0;
  let totalSolveTimeMs = 0;
  const eventLatencies: number[] = [];

  for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
    const event = events[eventIdx]!;
    // Consistently evaluate candidate scenario for this event
    const candidateScenario = applyEventToScenario(currentScenario, event);

    const evStart = performance.now();

    if (strategy === 'Event-Triggered Local Repair') {
      const repairRes = repairIncrementally({
        event,
        scenario: candidateScenario,
        baselinePlan: currentPlan,
        travelTimeProvider: provider,
      });

      const evDuration = performance.now() - evStart;
      eventLatencies.push(evDuration);
      totalSolveTimeMs += evDuration;

      if (repairRes.status === 'PROPOSED' && repairRes.repairedPlan) {
        cumulativeChurn += repairRes.churn.reassignedRequestsCount;
        newlyUnservedCount += repairRes.churn.newlyUnservedRequestsCount;
        frozenViolationsCount += repairRes.churn.frozenStopsViolated;
        currentPlan = repairRes.repairedPlan;
        currentScenario = candidateScenario;
      } else {
        infeasibleRepairsCount++;
      }
    } else if (strategy === 'Full Re-solve (Cluster-Allocation)') {
      // Re-solve full scenario with existing frozen stops preserved
      const frozenRoutes = currentPlan.routes.map((r) => ({
        ...r,
        stops: r.stops.filter((s) => s.isFrozen),
      }));

      const newPlan = solveClusterAllocation(candidateScenario, {
        travelTimeProvider: provider,
        existingFrozenRoutes: frozenRoutes,
      });

      const evDuration = performance.now() - evStart;
      eventLatencies.push(evDuration);
      totalSolveTimeMs += evDuration;

      const churn = calculateIncrementalChurn(currentPlan, newPlan);
      cumulativeChurn += churn.reassignedRequestsCount;
      newlyUnservedCount += churn.newlyUnservedRequestsCount;
      frozenViolationsCount += churn.frozenStopsViolated;
      currentPlan = newPlan;
      currentScenario = candidateScenario;
    } else if (strategy === 'Insertion + Periodic Reopt (k=5)') {
      // Incremental repair for events; every 5 events run reoptimization
      const repairRes = repairIncrementally({
        event,
        scenario: candidateScenario,
        baselinePlan: currentPlan,
        travelTimeProvider: provider,
      });

      if (repairRes.status === 'PROPOSED' && repairRes.repairedPlan) {
        cumulativeChurn += repairRes.churn.reassignedRequestsCount;
        newlyUnservedCount += repairRes.churn.newlyUnservedRequestsCount;
        frozenViolationsCount += repairRes.churn.frozenStopsViolated;
        currentPlan = repairRes.repairedPlan;
        currentScenario = candidateScenario;
      } else {
        infeasibleRepairsCount++;
      }

      if ((eventIdx + 1) % 5 === 0) {
        const frozenRoutes = currentPlan.routes.map((r) => ({
          ...r,
          stops: r.stops.filter((s) => s.isFrozen),
        }));
        const reoptPlan = solveClusterAllocation(currentScenario, {
          travelTimeProvider: provider,
          existingFrozenRoutes: frozenRoutes,
        });
        const reoptChurn = calculateIncrementalChurn(currentPlan, reoptPlan);
        cumulativeChurn += reoptChurn.reassignedRequestsCount;
        frozenViolationsCount += reoptChurn.frozenStopsViolated;
        currentPlan = reoptPlan;
      }

      const evDuration = performance.now() - evStart;
      eventLatencies.push(evDuration);
      totalSolveTimeMs += evDuration;
    }
  }

  const p50 = percentile(eventLatencies, 50);
  const p95 = percentile(eventLatencies, 95);

  return {
    strategy,
    caseName,
    seed,
    coveragePercent: currentPlan.metrics.coveragePercent,
    totalTravelTimeMinutes: currentPlan.metrics.totalTravelTimeMinutes,
    highPriorityWaitMinutes: currentPlan.metrics.highPriorityWaitTimeMinutes,
    totalSolveTimeMs: Number(totalSolveTimeMs.toFixed(2)),
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    cumulativeChurn,
    newlyUnservedCount,
    frozenViolationsCount,
    infeasibleRepairsCount,
  };
}

/**
 * Evaluates all three strategies across multiple deterministic seeds for a benchmark size.
 */
export function evaluateIncrementalStrategiesOnCase(
  benchCase: IncrementalBenchmarkCase,
  seedCount = 20,
  baseSeed = 42,
): IncrementalStrategySummary[] {
  const strategies: RepairStrategy[] = [
    'Event-Triggered Local Repair',
    'Insertion + Periodic Reopt (k=5)',
    'Full Re-solve (Cluster-Allocation)',
  ];

  const summaries: IncrementalStrategySummary[] = [];

  for (const strategy of strategies) {
    const runs: StrategyRunMetrics[] = [];

    for (let i = 0; i < seedCount; i++) {
      const seed = baseSeed + i * 17;
      const initialScenario = generateScenario({
        seed,
        requestCount: benchCase.requestCount,
        resourceCount: benchCase.resourceCount,
        shelterCount: benchCase.shelterCount,
      });

      const events = generateDeterministicEvents(initialScenario, benchCase.eventsCount, seed);
      const run = runStrategyBenchmark(strategy, initialScenario, events, seed, benchCase.name);
      runs.push(run);
    }

    const coverages = runs.map((r) => r.coveragePercent);
    const travelTimes = runs.map((r) => r.totalTravelTimeMinutes);
    const waits = runs.map((r) => r.highPriorityWaitMinutes);
    const solveTimes = runs.map((r) => r.totalSolveTimeMs);
    const p50s = runs.map((r) => r.p50LatencyMs);
    const p95s = runs.map((r) => r.p95LatencyMs);
    const churns = runs.map((r) => r.cumulativeChurn);
    const unserved = runs.map((r) => r.newlyUnservedCount);
    const violations = runs.reduce((sum, r) => sum + r.frozenViolationsCount, 0);
    const totalInfeasible = runs.reduce((sum, r) => sum + r.infeasibleRepairsCount, 0);
    const totalEventsEvaluated = runs.length * benchCase.eventsCount;

    const covStats = meanAndStdev(coverages);
    const timeStats = meanAndStdev(travelTimes);
    const waitStats = meanAndStdev(waits);
    const solveStats = meanAndStdev(solveTimes);
    const p50Stats = meanAndStdev(p50s);
    const p95Stats = meanAndStdev(p95s);
    const churnStats = meanAndStdev(churns);
    const unservedStats = meanAndStdev(unserved);

    summaries.push({
      strategy,
      caseName: benchCase.name,
      seedsRun: seedCount,
      coverageMean: covStats.mean,
      travelTimeMean: timeStats.mean,
      travelTimeSpread: timeStats.stdev,
      highPriorityWaitMean: waitStats.mean,
      totalSolveTimeMsMean: solveStats.mean,
      p50LatencyMsMean: p50Stats.mean,
      p95LatencyMsMean: p95Stats.mean,
      cumulativeChurnMean: churnStats.mean,
      newlyUnservedMean: unservedStats.mean,
      frozenViolationsTotal: violations,
      infeasibleRatePercent: Number(((totalInfeasible / totalEventsEvaluated) * 100).toFixed(2)),
    });
  }

  return summaries;
}

export function formatIncrementalMarkdownTable(summaries: IncrementalStrategySummary[]): string {
  const headers = [
    'Strategy',
    'Scenario',
    'Coverage (%)',
    'Travel Time (min)',
    'High-Pri Wait (min)',
    'Total Time (ms)',
    'p50 Lat (ms)',
    'p95 Lat (ms)',
    'Churn',
    'Frozen Viol',
    'Infeas Rate (%)',
  ];

  const rows = summaries.map((s) => [
    s.strategy,
    s.caseName,
    `${s.coverageMean}%`,
    `${s.travelTimeMean} ± ${s.travelTimeSpread}`,
    `${s.highPriorityWaitMean}`,
    `${s.totalSolveTimeMsMean}`,
    `${s.p50LatencyMsMean}`,
    `${s.p95LatencyMsMean}`,
    `${s.cumulativeChurnMean}`,
    `${s.frozenViolationsTotal}`,
    `${s.infeasibleRatePercent}%`,
  ]);

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)),
  );

  const pad = (s: string, len: number) => s.padEnd(len, ' ');
  const headerLine = `| ${headers.map((h, i) => pad(h, colWidths[i]!)).join(' | ')} |`;
  const sepLine = `| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const dataLines = rows.map(
    (row) => `| ${row.map((cell, i) => pad(cell, colWidths[i]!)).join(' | ')} |`,
  );

  return [headerLine, sepLine, ...dataLines].join('\n');
}

export function exportBenchmarkSummariesToCsv(summaries: IncrementalStrategySummary[]): string {
  const headers = [
    'strategy',
    'caseName',
    'seedsRun',
    'coverageMean',
    'travelTimeMean',
    'travelTimeSpread',
    'highPriorityWaitMean',
    'totalSolveTimeMsMean',
    'p50LatencyMsMean',
    'p95LatencyMsMean',
    'cumulativeChurnMean',
    'newlyUnservedMean',
    'frozenViolationsTotal',
    'infeasibleRatePercent',
  ];
  const rows = summaries.map((s) => [
    `"${s.strategy}"`,
    `"${s.caseName}"`,
    s.seedsRun,
    s.coverageMean,
    s.travelTimeMean,
    s.travelTimeSpread,
    s.highPriorityWaitMean,
    s.totalSolveTimeMsMean,
    s.p50LatencyMsMean,
    s.p95LatencyMsMean,
    s.cumulativeChurnMean,
    s.newlyUnservedMean,
    s.frozenViolationsTotal,
    s.infeasibleRatePercent,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportBenchmarkSummariesToJson(summaries: IncrementalStrategySummary[]): string {
  return JSON.stringify(summaries, null, 2);
}
