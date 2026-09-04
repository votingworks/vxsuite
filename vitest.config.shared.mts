import { fileURLToPath } from 'node:url';
import * as vitest from 'vitest/config';

const isCI = process.env['CI'] === 'true';

const coverageCheckReporter = fileURLToPath(
  new URL('./libs/coverage-check/vitest_coverage_reporter.cjs', import.meta.url)
);

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
      // Collect coverage in CI only; locally, tests run without coverage for
      // speed. Together with vitest's built-in watch-when-interactive default,
      // this lets a single `test` script (`vitest`) watch locally and run once
      // with coverage in CI.
      enabled: isCI,
      // coverage-check is our custom reporter from libs/coverage-check
      // `json` writes coverage-final.json if needed for debugging
      // (e.g. if something weird happens in CI)
      reporter: ['json', [coverageCheckReporter, {}]],
      provider: 'istanbul',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
    clearMocks: true,
    // Reuse transformed modules across runs: 7-18% off a warm rerun.
    fsModuleCache: true,
    maxWorkers: isCI ? 6 : localMaxWorkers,
    // The junit reporter runs everywhere so that `reports/junit.xml` is
    // always produced and can be declared as a turbo output for
    // `test:run:self` — without it, a cached test task would leave CircleCI's
    // `store_test_results` with nothing to upload. It writes to the file
    // rather than the console, so local output is unaffected (`junit.xml` is
    // gitignored).
    reporters: ['verbose', 'junit'],
    outputFile: 'reports/junit.xml',
    // 10s everywhere. A full-workspace `pnpm test` runs many suites at once and
    // briefly oversubscribes the CPU, so a tighter budget would flake
    // otherwise-fast tests under that transient load.
    testTimeout: 10_000,
  },
};

export function defineConfig(
  config: vitest.ViteUserConfig = {}
): vitest.ViteUserConfig {
  return vitest.defineConfig(vitest.mergeConfig(base, config));
}
