import type { Scenario, SolverPlan } from '@floodrelay/shared';
import { solveNearestFirst } from '../baselines/nearestFirst.js';
import { solveClarkeWrightBaseline } from '../baselines/clarkeWrightBaseline.js';
import { generateScenario } from '../generator.js';
import { solveClusterAllocation } from '../heuristics/clusterAllocation.js';

export interface BenchmarkCase {
  name: string;
  requestCount: number;
  resourceCount: number;
  shelterCount: number;
}

export const STANDARD_BENCHMARK_CASES: readonly BenchmarkCase[] = [
  { name: 'Small (20 req / 4 res)', requestCount: 20, resourceCount: 4, shelterCount: 2 },
  { name: 'Medium (100 req / 12 res)', requestCount: 100, resourceCount: 12, shelterCount: 3 },
  { name: 'Large (500 req / 30 res)', requestCount: 500, resourceCount: 30, shelterCount: 5 },
];

export type SolverFn = (scenario: Scenario) => SolverPlan;

export interface SolverBenchmarkSummary {
  solverName: string;
  caseName: string;
  seedsRun: number;
  coverageMean: number;
  coverageSpread: number;
  travelTimeMean: number;
  travelTimeSpread: number;
  highPriorityWaitMean: number;
  highPriorityWaitSpread: number;
  solveTimeMsMean: number;
  solveTimeMsMax: number;
}

function meanAndStdev(values: number[]): { mean: number; stdev: number } {
  if (values.length === 0) return { mean: 0, stdev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    (values.length > 1 ? values.length - 1 : 1);
  const stdev = Math.sqrt(variance);
  return {
    mean: Number(mean.toFixed(2)),
    stdev: Number(stdev.toFixed(2)),
  };
}

export function evaluateSolversOnCase(
  benchCase: BenchmarkCase,
  seedCount = 5,
  solvers: Record<string, SolverFn> = {
    'Nearest-First (Greedy)': solveNearestFirst,
    'Cluster-Allocation': solveClusterAllocation,
    'Clarke-Wright + 2-opt baseline': solveClarkeWrightBaseline,
  },
  baseSeed = 42,
): SolverBenchmarkSummary[] {
  const summaries: SolverBenchmarkSummary[] = [];

  for (const [solverName, solverFn] of Object.entries(solvers)) {
    const coverages: number[] = [];
    const travelTimes: number[] = [];
    const highPriorityWaits: number[] = [];
    const solveTimes: number[] = [];

    for (let i = 0; i < seedCount; i++) {
      const scenario = generateScenario({
        seed: baseSeed + i * 1000,
        requestCount: benchCase.requestCount,
        resourceCount: benchCase.resourceCount,
        shelterCount: benchCase.shelterCount,
      });

      const plan = solverFn(scenario);
      coverages.push(plan.metrics.coveragePercent);
      travelTimes.push(plan.metrics.totalTravelTimeMinutes);
      highPriorityWaits.push(plan.metrics.highPriorityWaitTimeMinutes);
      solveTimes.push(plan.metrics.solveDurationMs);
    }

    const cov = meanAndStdev(coverages);
    const tt = meanAndStdev(travelTimes);
    const hp = meanAndStdev(highPriorityWaits);
    const st = meanAndStdev(solveTimes);
    const maxSolve = solveTimes.length > 0 ? Math.max(...solveTimes) : 0;

    summaries.push({
      solverName,
      caseName: benchCase.name,
      seedsRun: seedCount,
      coverageMean: cov.mean,
      coverageSpread: cov.stdev,
      travelTimeMean: tt.mean,
      travelTimeSpread: tt.stdev,
      highPriorityWaitMean: hp.mean,
      highPriorityWaitSpread: hp.stdev,
      solveTimeMsMean: st.mean,
      solveTimeMsMax: maxSolve,
    });
  }

  return summaries;
}

export function formatMarkdownResultsTable(summaries: SolverBenchmarkSummary[]): string {
  const disclaimers = [
    '> **DISCLAIMER & BENCHMARK LIMITATIONS:**',
    '> - The dataset is **SIMULATED** (synthetic rescue requests, resources, and shelters generated via deterministic seeded PRNG).',
    '> - Travel times are **assumptions** (haversine distances scaled by `ASSUMED_ROAD_DETOUR_FACTOR` and placeholder vehicle speeds).',
    '> - This result is **not a field benchmark** and must not be interpreted as guaranteed real-world disaster response performance.',
    '',
  ];

  const header = [
    '| Scenario Size | Solver | Seeds | Coverage (%) | Travel Time (min) | High-Priority Wait (min) | Solve Time (ms) |',
    '|---|---|---|---|---|---|---|',
  ];

  const rows = summaries.map((s) => {
    const cov = `${s.coverageMean} ± ${s.coverageSpread}`;
    const tt = `${s.travelTimeMean} ± ${s.travelTimeSpread}`;
    const hp = `${s.highPriorityWaitMean} ± ${s.highPriorityWaitSpread}`;
    const st = `${s.solveTimeMsMean} ms (max ${s.solveTimeMsMax})`;
    return `| ${s.caseName} | ${s.solverName} | ${s.seedsRun} | ${cov} | ${tt} | ${hp} | ${st} |`;
  });

  return [...disclaimers, ...header, ...rows].join('\n');
}
