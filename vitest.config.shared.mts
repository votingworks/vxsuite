import * as vitest from 'vitest/config';

const isCI = process.env['CI'] === 'true';

// When the whole workspace is tested at once (root `pnpm test` → `turbo run
// test:run` across ~50 packages), many vitest suites run concurrently in a
// single worktree. Left uncapped, each suite sizes its worker pool to the full
// core count, so turbo's concurrency × vitest's per-suite workers massively
// oversubscribes the CPU and trips 5s test timeouts nondeterministically. The
// root aggregate sets VX_TEST_WORKERS to cap each suite's pool so
// concurrency × workers ≈ cores. A single-package `pnpm test:run` runs vitest
// directly (not through turbo), leaves VX_TEST_WORKERS unset, and keeps the
// default (all cores) for speed. CI runs one package per container, so it uses
// its own fixed cap.
function parseTestWorkers(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const workers = Number(value);
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(
      `VX_TEST_WORKERS must be a positive integer, got: ${value}`
    );
  }
  return workers;
}

const localMaxWorkers = parseTestWorkers(process.env['VX_TEST_WORKERS']);

export const base: vitest.ViteUserConfig = {
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      // Collect coverage (and enforce thresholds) in CI only; locally, tests
      // run without coverage for speed. This — together with vitest's built-in
      // watch-when-interactive default — is what lets a single `test` script
      // (`vitest`) watch locally and run-once-with-coverage in CI, replacing
      // the previous is-ci `test:ci`/`test:watch` split.
      enabled: isCI,
      thresholds: {
        lines: 100,
        branches: 100,
      },
      reportOnFailure: true,
      provider: 'istanbul',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
    clearMocks: true,
    maxWorkers: isCI ? 6 : localMaxWorkers,
    reporters: isCI ? ['verbose', 'junit'] : [],
    outputFile: isCI ? 'reports/junit.xml' : undefined,
    // 10s everywhere. Locally, a full-workspace `pnpm test` runs many suites at
    // once and briefly oversubscribes the CPU; vitest's bare 5s default would
    // give local runs *less* headroom than CI despite more contention, causing
    // nondeterministic timeout flakes in otherwise-fast tests. Matching CI's
    // budget absorbs those transient spikes.
    testTimeout: 10_000,
  },
};

export function defineConfig(
  config: vitest.ViteUserConfig = {}
): vitest.ViteUserConfig {
  return vitest.defineConfig(vitest.mergeConfig(base, config));
}
