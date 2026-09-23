/* eslint-disable no-console */
import { expect } from 'vitest';
import {
  BenchmarkResults,
  computeBenchmarkStats,
  formatMs,
  printBenchmarkResults,
  runBenchmark,
} from '@votingworks/test-utils';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const { UPDATE_BENCHMARKS, BENCHMARKS_ENV: BENCHMARK_ENV } = process.env;
const ENV = BENCHMARK_ENV ?? 'development-m4-macbook-pro';

/**
 * How much slower than the saved baseline a benchmark may run before failing.
 * The benchmarks can be noisy so this is a fairly large buffer.
 */
const MAX_REGRESSION_RATIO = 1.2;

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
 * `goalMs` is informational, not enforced: it describes the time this path
 * should eventually meet at this scale, and a run over its goal prints a
 * warning without failing the test. Once a goal is being met, ratcheting it
 * into an enforced assertion is a deliberate follow-up.
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
  warmupRuns,
  goalMs,
  cleanup,
}: {
  label: string;
  func: () => unknown | Promise<unknown>;
  runs: number;
  warmupRuns?: number;
  goalMs?: number;
  /** Runs after each invocation of `func`, outside the measured window. */
  cleanup?: () => unknown | Promise<unknown>;
}): Promise<void> {
  if (!printedEnv) {
    console.log(`Benchmark environment: ${ENV}`);
    printedEnv = true;
  }
  console.log(`\nRunning benchmark: ${label}`);

  const newResults = await runBenchmark({ func, runs, warmupRuns, cleanup });
  const oldResults = loadResults(label);
  printBenchmarkResults(label, newResults, oldResults);

  if (UPDATE_BENCHMARKS || !oldResults) {
    saveResults(label, newResults);
    console.log(`Saved new benchmark results for "${label}"`);
  }

  if (oldResults) {
    expect(
      newResults.stats.median,
      `median ${formatMs(newResults.stats.median)} regressed more than ` +
        `${MAX_REGRESSION_RATIO}x from the saved ${formatMs(
          oldResults.stats.median
        )}`
    ).toBeLessThanOrEqual(oldResults.stats.median * MAX_REGRESSION_RATIO);
  }

  if (goalMs !== undefined && newResults.stats.median > goalMs) {
    console.warn(
      `⚠️ "${label}" median ${formatMs(
        newResults.stats.median
      )} is over its ${formatMs(goalMs)} goal (informational, not enforced)`
    );
  }
}
