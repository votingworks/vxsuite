import { expect } from 'vitest';
import {
  type BenchmarkResults,
  computeBenchmarkStats,
  percentChange,
  printBenchmarkResults,
  runBenchmark,
} from '@votingworks/test-utils';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const { UPDATE_BENCHMARKS, BENCHMARKS_ENV: BENCHMARK_ENV } = process.env;
const ENV = BENCHMARK_ENV ?? 'development-m1-macbook-pro';

let printedEnv = false;

function resultsFilePath(label: string) {
  return join(
    import.meta.dirname,
    'results',
    ENV,
    `${label.replaceAll(' ', '-')}.json`
  );
}

function saveResults(label: string, results: BenchmarkResults) {
  const filePath = resultsFilePath(label);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(results.measurements, null, 2));
}

function loadResults(label: string): BenchmarkResults | undefined {
  if (!existsSync(resultsFilePath(label))) return undefined;
  const measurements = JSON.parse(readFileSync(resultsFilePath(label), 'utf8'));
  return {
    measurements,
    stats: computeBenchmarkStats(measurements),
  };
}

/**
 * Run a benchmark test and compare the results to the previous saved results.
 * Fails if the new results are slower than the old results (based on comparing
 * the mean and median, with some tolerance for noise).
 *
 * To update the saved results, run the test with the `UPDATE_BENCHMARKS` env
 * var set.
 *
 * To create a new result set (e.g. when running on a different machine), run
 * the test with the `BENCHMARKS_ENV=<name>` env var set. E.g.
 * `BENCHMARKS_ENV=development-m1-macbook-pro`.
 */
export async function benchmarkRegressionTest({
  label,
  func,
  runs,
}: {
  label: string;
  func: () => Promise<void>;
  runs: number;
}): Promise<void> {
  if (!printedEnv) {
    // eslint-disable-next-line no-console
    console.log(`Benchmark environment: ${ENV}`);
    printedEnv = true;
  }
  // eslint-disable-next-line no-console
  console.log(`\nRunning benchmark: ${label}`);

  const newResults = await runBenchmark({ func, runs });
  const oldResults = loadResults(label);
  printBenchmarkResults(label, newResults, oldResults);

  if (UPDATE_BENCHMARKS || !oldResults) {
    saveResults(label, newResults);
    // eslint-disable-next-line no-console
    console.log(`Saved new benchmark results for "${label}"`);
  }

  if (oldResults) {
    const newStats = newResults.stats;
    const oldStats = oldResults.stats;

    // Check that the new mean isn't slower than the old mean.
    // To avoid false positives due to noise in the measurements, use the margin
    // of error to give ourselves a window of tolerance.
    const fastestNewMean = newStats.mean - newStats.marginOfError;
    const slowestOldMean = oldStats.mean + oldStats.marginOfError;
    expect(fastestNewMean).toBeLessThanOrEqual(slowestOldMean);

    // Also check that the median hasn't changed by more than 5%
    const change = percentChange(oldStats.median, newStats.median);
    expect(change).toBeLessThanOrEqual(0.05);
  }
}
