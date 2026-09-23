import { afterEach, expect, test, vi } from 'vitest';
import {
  computeBenchmarkStats,
  formatMs,
  measureTime,
  percentChange,
  printBenchmarkResults,
  runBenchmark,
} from './benchmarking.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('computeBenchmarkStats', () => {
  const stats = computeBenchmarkStats([30, 10, 20]);
  expect(stats.min).toEqual(10);
  expect(stats.max).toEqual(30);
  expect(stats.mean).toEqual(20);
  expect(stats.median).toEqual(20);
  expect(stats.variance).toEqual(100);
  expect(stats.standardDeviation).toEqual(10);
  expect(stats.marginOfError).toBeCloseTo((10 * 2.576) / Math.sqrt(3));
});

test('computeBenchmarkStats with a single measurement', () => {
  const stats = computeBenchmarkStats([42]);
  expect(stats).toEqual({
    min: 42,
    max: 42,
    mean: 42,
    median: 42,
    variance: 0,
    standardDeviation: 0,
    marginOfError: 0,
  });
});

test('measureTime', async () => {
  vi.spyOn(performance, 'now')
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(147);
  expect(await measureTime(() => undefined)).toEqual(47);
});

test('runBenchmark warms up without measuring', async () => {
  let calls = 0;
  const results = await runBenchmark({
    func: () => {
      calls += 1;
    },
    runs: 2,
    warmupRuns: 3,
  });
  expect(calls).toEqual(5);
  expect(results.measurements).toHaveLength(2);
  expect(results.stats.min).toBeGreaterThanOrEqual(0);
});

test('runBenchmark defaults to 3 warmup runs', async () => {
  let calls = 0;
  const results = await runBenchmark({
    func: () => {
      calls += 1;
      return Promise.resolve();
    },
    runs: 1,
  });
  expect(calls).toEqual(4);
  expect(results.measurements).toHaveLength(1);
});

test('runBenchmark runs cleanup after every invocation, unmeasured', async () => {
  const calls: string[] = [];
  const results = await runBenchmark({
    func: () => calls.push('func'),
    cleanup: () => calls.push('cleanup'),
    runs: 2,
    warmupRuns: 1,
  });
  expect(calls).toEqual([
    'func',
    'cleanup',
    'func',
    'cleanup',
    'func',
    'cleanup',
  ]);
  expect(results.measurements).toHaveLength(2);
});

test('formatMs', () => {
  expect(formatMs(0)).toEqual('0ms');
  expect(formatMs(47.4)).toEqual('47ms');
  expect(formatMs(999.4)).toEqual('999ms');
  expect(formatMs(1000)).toEqual('1s');
  expect(formatMs(1236)).toEqual('1.24s');
  expect(formatMs(75_330)).toEqual('75.33s');
});

test('percentChange', () => {
  expect(percentChange(100, 105)).toEqual(0.05);
  expect(percentChange(100, 80)).toEqual(-0.2);
});

test('printBenchmarkResults without previous results', () => {
  const log = vi.spyOn(console, 'log').mockReturnValue();
  printBenchmarkResults('my benchmark', {
    measurements: [1200],
    stats: computeBenchmarkStats([1200]),
  });
  expect(log).toHaveBeenCalledOnce();
  const output = log.mock.calls[0]![0] as string;
  expect(output).toContain('my benchmark');
  expect(output).toContain('new');
  expect(output).toContain('1.2s');
  expect(output).not.toContain('old');
  expect(output).not.toContain('change');
});

test('printBenchmarkResults with previous results', () => {
  const log = vi.spyOn(console, 'log').mockReturnValue();
  printBenchmarkResults(
    'my benchmark',
    {
      measurements: [80, 90, 100],
      stats: computeBenchmarkStats([80, 90, 100]),
    },
    {
      measurements: [100, 110, 120],
      stats: computeBenchmarkStats([100, 110, 120]),
    }
  );
  const output = log.mock.calls[0]![0] as string;
  expect(output).toContain('old');
  expect(output).toContain('change');
  // medians: 110 -> 90 is ~18% faster
  expect(output).toContain('-18.18%');
  // mins: 100 -> 80 is 20% faster
  expect(output).toContain('-20%');
});

test('printBenchmarkResults formats a slowdown with a plus sign', () => {
  const log = vi.spyOn(console, 'log').mockReturnValue();
  printBenchmarkResults(
    'my benchmark',
    { measurements: [120], stats: computeBenchmarkStats([120]) },
    { measurements: [100], stats: computeBenchmarkStats([100]) }
  );
  const output = log.mock.calls[0]![0] as string;
  expect(output).toContain('+20%');
});
