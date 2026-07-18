import * as vitest from 'vitest/config';

const isCI = process.env['CI'] === 'true';

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
    maxWorkers: isCI ? 6 : undefined,
    reporters: isCI ? ['verbose', 'junit'] : [],
    outputFile: isCI ? 'reports/junit.xml' : undefined,
    testTimeout: isCI ? 10_000 : undefined,
  },
};

export function defineConfig(
  config: vitest.ViteUserConfig = {}
): vitest.ViteUserConfig {
  return vitest.defineConfig(vitest.mergeConfig(base, config));
}
