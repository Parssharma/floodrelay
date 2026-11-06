import {
  evaluateIncrementalStrategiesOnCase,
  formatIncrementalMarkdownTable,
  INCREMENTAL_SIZE_LARGE,
  INCREMENTAL_SIZE_MEDIUM,
  INCREMENTAL_SIZE_SMALL,
  STANDARD_INCREMENTAL_CASES,
  type IncrementalStrategySummary,
} from '@floodrelay/solver';

console.log('================================================================================');
console.log('FLOODRELAY PHASE 5 PART 2 — INCREMENTAL OPTIMIZATION STRATEGY STUDY');
console.log('NOTICE: Compares three strategies under reproducible operational event workloads:');
console.log('  1. Full Re-solve (Cluster-Allocation with preserved frozen stops)');
console.log('  2. Insertion + Periodic Reoptimization (k=5 events)');
console.log('  3. Event-Triggered Local Repair (pure incremental orchestrator)');
console.log('NOTICE: Evaluated on synthetic flood rescue workloads with deterministic seeds.');
console.log('================================================================================\n');

// Parse CLI flags
const args = process.argv.slice(2);
const largeOnly = args.includes('--large-only');
const mediumOnly = args.includes('--medium-only');
const smallOnly = args.includes('--small-only');
const jsonOutput = args.includes('--json');
const csvOutput = args.includes('--csv');

const seedIdx = args.indexOf('--seed');
const baseSeed = seedIdx !== -1 && args[seedIdx + 1] ? Number(args[seedIdx + 1]) : 42;

const countIdx = args.indexOf('--seeds') !== -1 ? args.indexOf('--seeds') : args.indexOf('--count');
const seedCount = countIdx !== -1 && args[countIdx + 1] ? Number(args[countIdx + 1]) : 20;

let casesToRun = STANDARD_INCREMENTAL_CASES;
if (largeOnly) {
  casesToRun = [INCREMENTAL_SIZE_LARGE];
} else if (mediumOnly) {
  casesToRun = [INCREMENTAL_SIZE_MEDIUM];
} else if (smallOnly) {
  casesToRun = [INCREMENTAL_SIZE_SMALL];
}

const allSummaries: IncrementalStrategySummary[] = [];

for (const benchCase of casesToRun) {
  console.log(
    `Evaluating case: ${benchCase.name} (seeds = ${seedCount}, baseSeed = ${baseSeed}, events = ${benchCase.eventsCount})...`,
  );
  const start = Date.now();
  const summaries = evaluateIncrementalStrategiesOnCase(benchCase, seedCount, baseSeed);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`  Completed in ${elapsed}s.\n`);
  allSummaries.push(...summaries);
}

if (jsonOutput) {
  console.log(JSON.stringify(allSummaries, null, 2));
} else if (csvOutput) {
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
  console.log(headers.join(','));
  for (const s of allSummaries) {
    const row = [
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
    ];
    console.log(row.join(','));
  }
} else {
  console.log('### Incremental Strategy Benchmark Study Results\n');
  console.log(formatIncrementalMarkdownTable(allSummaries));
  console.log('\n');
}
