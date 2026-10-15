import {
  evaluateSolversOnCase,
  formatMarkdownResultsTable,
  STANDARD_BENCHMARK_CASES,
  type BenchmarkCase,
} from '@floodrelay/solver';

console.log('=== FloodRelay Solver Evaluation Benchmark ===');
console.log('NOTICE: The scenario data evaluated here is SIMULATED.');
console.log(
  'NOTICE: Travel times are assumptions (based on geodesic distances and assumed speeds/detours).',
);
console.log(
  'NOTICE: The result is not a field benchmark and does not represent real-world emergency response performance.\n',
);

const args = process.argv.slice(2);
const isLargeOnly = args.includes('--large-only');
const seedArgIdx = args.indexOf('--seed');
const fixedSeed = seedArgIdx !== -1 && args[seedArgIdx + 1] ? Number(args[seedArgIdx + 1]) : 42;

const casesToRun: readonly BenchmarkCase[] = isLargeOnly
  ? [STANDARD_BENCHMARK_CASES.find((c) => c.requestCount === 500)!]
  : STANDARD_BENCHMARK_CASES;

const seedCount = isLargeOnly ? 1 : 5;

const allSummaries = [];

for (const benchCase of casesToRun) {
  console.log(`Evaluating: ${benchCase.name} (seeds = ${seedCount}, baseSeed = ${fixedSeed})...`);
  const summaries = evaluateSolversOnCase(benchCase, seedCount, undefined, fixedSeed);
  allSummaries.push(...summaries);
}

console.log('\n### Benchmark Results Table\n');
console.log(formatMarkdownResultsTable(allSummaries));
