/* eslint-disable vx/gts-safe-number-parse */
import { assertDefined, iter, range } from '@votingworks/basics';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const { UPDATE_BENCHMARKS, BENCHMARKS_ENV: BENCHMARK_ENV } = process.env;
const ENV = BENCHMARK_ENV ?? 'development-m1-macbook-pro';

async function measureTime(func: () => Promise<void>): Promise<Milliseconds> {
  const start = process.hrtime.bigint();
  await func();
  const end = process.hrtime.bigint();

  return Number((end - start) / BigInt(10_000)) / 100;
}

type Milliseconds = number;

interface BenchmarkStats {
  min: Milliseconds;
  max: Milliseconds;
  mean: Milliseconds;
  median: Milliseconds;
  variance: Milliseconds;
  standardDeviation: Milliseconds;
  marginOfError: Milliseconds;
}

interface BenchmarkResults {
  measurements: Milliseconds[];
  stats: BenchmarkStats;
}

function computeStats(measurements: Milliseconds[]): BenchmarkStats {
  const min = Math.min(...measurements);
  const max = Math.max(...measurements);
  const mean = iter(measurements).sum() / measurements.length;
  // See https://www.mathsisfun.com/data/standard-deviation.html
  const variance =
    iter(measurements)
      .map((x) => (x - mean) ** 2)
      .sum() /
    (measurements.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const median = assertDefined(
    [...measurements].sort()[Math.floor(measurements.length / 2)]
  );
  // 99% confidence interval
  // See https://www.mathsisfun.com/data/confidence-interval.html
  const marginOfError =
    (standardDeviation * 2.576) / Math.sqrt(measurements.length);

  return {
    min,
    max,
    mean,
    median,
    variance,
    standardDeviation,
    marginOfError,
  };
}

async function benchmark(
  func: () => Promise<void>,
  runs: number
): Promise<BenchmarkResults> {
  // Warm up the system by running the function a few times without measuring
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const i of range(0, 3)) {
    await measureTime(func);
  }

  const measurements: Milliseconds[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const i of range(0, runs)) {
    measurements.push(await measureTime(func));
  }

  return {
    measurements,
    stats: computeStats(measurements),
  };
}

function resultsFilePath(label: string) {
  return join(__dirname, 'results', ENV, `${label.replaceAll(' ', '-')}.json`);
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
    stats: computeStats(measurements),
  };
}

function formatMs(milliseconds: Milliseconds): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)}ms`;
  }
  return `${Number((milliseconds / 1000).toFixed(2))}s`;
}

function percentChange(old: number, current: number) {
  return (current - old) / old;
}

function formatPercentChange(percent: number): string {
  const sign = percent < 0 ? '-' : '+';
  return `${sign}${Math.abs(Number((percent * 100).toFixed(2)))}%`;
}

function textTable(rows: Array<Record<string, string>>): string {
  const keys = Object.keys(assertDefined(rows[0]));
  const widths = keys.map((key) =>
    Math.max(...rows.map((row) => assertDefined(row[key]).length), key.length)
  );
  const spacer = '   ';
  const header = keys
    .map((key, i) => key.padEnd(assertDefined(widths[i])))
    .join(spacer);
  const divider = widths.map((width) => '-'.repeat(width)).join(spacer);
  const body = rows

    .map((row) =>
      keys
        .map((key, i) =>
          assertDefined(row[key]).padEnd(assertDefined(widths[i]))
        )
        .join(spacer)
    )
    .join('\n');
  return `${header}\n${divider}\n${body}`;
}

function printBenchmarkResults(
  label: string,
  newResults: BenchmarkResults,
  oldResults?: BenchmarkResults
) {
  const newStats = newResults.stats;
  const oldStats = oldResults?.stats;

  // eslint-disable-next-line no-console
  console.log(
    `${label}\n${textTable([
      ...(oldStats
        ? [
            {
              '': 'old',
              runs: oldResults.measurements.length.toString(),
              min: formatMs(oldStats.min),
              max: formatMs(oldStats.max),
              mean: `${formatMs(oldStats.mean)} ± ${formatMs(
                oldStats.marginOfError
              )}`,
              median: formatMs(oldStats.median),
            },
          ]
        : []),
      {
        '': 'new',
        runs: newResults.measurements.length.toString(),
        min: formatMs(newStats.min),
        max: formatMs(newStats.max),
        mean: `${formatMs(newStats.mean)} ± ${formatMs(
          newStats.marginOfError
        )}`,
        median: formatMs(newStats.median),
      },
      ...(oldStats
        ? [
            {
              '': 'change',
              runs: '',
              min: formatPercentChange(
                percentChange(oldStats.min, newStats.min)
              ),
              max: formatPercentChange(
                percentChange(oldStats.max, newStats.max)
              ),
              mean: formatPercentChange(
                percentChange(oldStats.mean, newStats.mean)
              ),
              median: formatPercentChange(
                percentChange(oldStats.median, newStats.median)
              ),
            },
          ]
        : []),
    ])}`
  );
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
  // eslint-disable-next-line no-console
  console.log('Running benchmark:', { env: ENV, label });

  const newResults = await benchmark(func, runs);
  const oldResults = loadResults(label);
  printBenchmarkResults(label, newResults, oldResults);
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

  if (UPDATE_BENCHMARKS || !oldResults) {
    saveResults(label, newResults);
    // eslint-disable-next-line no-console
    console.log(`Saved new benchmark results for "${label}"`);
  }
}
