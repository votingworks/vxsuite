import { assertDefined, iter, range } from '@votingworks/basics';

/** A duration in milliseconds. */
export type Milliseconds = number;

/** Summary statistics over a benchmark's measurements. */
export interface BenchmarkStats {
  min: Milliseconds;
  max: Milliseconds;
  mean: Milliseconds;
  median: Milliseconds;
  variance: Milliseconds;
  standardDeviation: Milliseconds;
  marginOfError: Milliseconds;
}

/** The raw measurements of a benchmark run and their statistics. */
export interface BenchmarkResults {
  measurements: Milliseconds[];
  stats: BenchmarkStats;
}

/** Computes {@link BenchmarkStats} over a set of measurements. */
export function computeBenchmarkStats(
  measurements: Milliseconds[]
): BenchmarkStats {
  const min = Math.min(...measurements);
  const max = Math.max(...measurements);
  const mean = iter(measurements).sum() / measurements.length;
  // See https://www.mathsisfun.com/data/standard-deviation.html
  const variance =
    measurements.length > 1
      ? iter(measurements)
          .map((x) => (x - mean) ** 2)
          .sum() /
        (measurements.length - 1)
      : 0;
  const standardDeviation = Math.sqrt(variance);
  const median = assertDefined(
    [...measurements].sort((a, b) => a - b)[Math.floor(measurements.length / 2)]
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

/** Times a single invocation of `func`. */
export async function measureTime(
  func: () => unknown | Promise<unknown>
): Promise<Milliseconds> {
  const start = performance.now();
  await func();
  return performance.now() - start;
}

/**
 * Runs `func` `warmupRuns` times without measuring (to get past cold caches
 * and JIT warmup), then `runs` more times, measuring each.
 */
export async function runBenchmark({
  func,
  runs,
  warmupRuns = 3,
}: {
  func: () => unknown | Promise<unknown>;
  runs: number;
  warmupRuns?: number;
}): Promise<BenchmarkResults> {
  for (const _ of range(0, warmupRuns)) {
    await measureTime(func);
  }

  const measurements: Milliseconds[] = [];
  for (const _ of range(0, runs)) {
    measurements.push(await measureTime(func));
  }

  return {
    measurements,
    stats: computeBenchmarkStats(measurements),
  };
}

/** Formats a duration for display, e.g. `47ms` or `1.24s`. */
export function formatMs(milliseconds: Milliseconds): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)}ms`;
  }
  return `${Math.round(milliseconds / 10) / 100}s`;
}

/** The relative change from `old` to `current`, e.g. `-0.05` for 5% faster. */
export function percentChange(old: number, current: number): number {
  return (current - old) / old;
}

function formatPercentChange(percent: number): string {
  const sign = percent < 0 ? '-' : '+';
  return `${sign}${Math.abs(Math.round(percent * 10_000) / 100)}%`;
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

/**
 * Prints a table of benchmark results, comparing against previous results
 * (with per-statistic percent changes) when given.
 */
export function printBenchmarkResults(
  label: string,
  newResults: BenchmarkResults,
  oldResults?: BenchmarkResults
): void {
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
