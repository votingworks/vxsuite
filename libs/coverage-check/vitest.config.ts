import { fileURLToPath } from 'node:url';
import { defineConfig } from '../../vitest.config.shared.mjs';

// Until the shared config registers coverage-check for every package, the
// package checks its own coverage.
const coverageCheckReporter = fileURLToPath(
  new URL('./vitest_coverage_reporter.cjs', import.meta.url)
);

export default defineConfig({
  test: {
    globalSetup: ['test/global_setup.ts'],
    coverage: {
      reporter: ['json', [coverageCheckReporter, {}]],
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
