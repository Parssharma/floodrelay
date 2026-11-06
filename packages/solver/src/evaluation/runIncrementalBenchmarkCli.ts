import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateIncrementalStrategiesOnCase,
  formatIncrementalMarkdownTable,
  exportBenchmarkSummariesToCsv,
  exportBenchmarkSummariesToJson,
  INCREMENTAL_SIZE_SMALL,
  INCREMENTAL_SIZE_MEDIUM,
  INCREMENTAL_SIZE_LARGE,
  type IncrementalStrategySummary,
} from './incrementalBenchmark.js';

async function main() {
  console.log('Starting FloodRelay Phase 5 Part 2 Incremental Benchmark Suite...');
  const startTime = Date.now();

  const allSummaries: IncrementalStrategySummary[] = [];

  // 1. Small scenario (20 seeds)
  console.log('\n[1/3] Running Small Scenario (20 req / 4 res / 2 sh, 20 seeds)...');
  const smallSummaries = evaluateIncrementalStrategiesOnCase(INCREMENTAL_SIZE_SMALL, 20, 100);
  allSummaries.push(...smallSummaries);
  console.log(formatIncrementalMarkdownTable(smallSummaries));

  // 2. Medium scenario (20 seeds)
  console.log('\n[2/3] Running Medium Scenario (100 req / 12 res / 3 sh, 20 seeds)...');
  const medSummaries = evaluateIncrementalStrategiesOnCase(INCREMENTAL_SIZE_MEDIUM, 20, 200);
  allSummaries.push(...medSummaries);
  console.log(formatIncrementalMarkdownTable(medSummaries));

  // 3. Large scenario (5 seeds for local speed, or 20)
  console.log('\n[3/3] Running Large Scenario (500 req / 30 res / 5 sh, 5 seeds)...');
  const largeSummaries = evaluateIncrementalStrategiesOnCase(INCREMENTAL_SIZE_LARGE, 5, 300);
  allSummaries.push(...largeSummaries);
  console.log(formatIncrementalMarkdownTable(largeSummaries));

  // Export results
  const outDir = path.resolve(process.cwd(), 'benchmark-results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvContent = exportBenchmarkSummariesToCsv(allSummaries);
  const jsonContent = exportBenchmarkSummariesToJson(allSummaries);
  const mdContent = formatIncrementalMarkdownTable(allSummaries);

  fs.writeFileSync(path.join(outDir, 'incremental_benchmark_results.csv'), csvContent);
  fs.writeFileSync(path.join(outDir, 'incremental_benchmark_results.json'), jsonContent);
  fs.writeFileSync(path.join(outDir, 'incremental_benchmark_results.md'), mdContent);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nBenchmark run complete in ${durationSec}s. Results exported to benchmark-results/`,
  );
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
