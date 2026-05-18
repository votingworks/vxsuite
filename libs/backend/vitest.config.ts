import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      // vitest 4's AST-aware coverage remapping no longer honors
      // `/* istanbul ignore file */` at the top of these test-runner /
      // app-tested files, so list them explicitly. Also bumps uncovered
      // counts on switch `default:` cases that v3 would ignore.
      exclude: ['src/ui_strings/**'],
      thresholds: {
        lines: -25,
        branches: -30,
      },
    },
  },
});
