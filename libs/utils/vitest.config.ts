import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      // vitest 4's AST-aware coverage remapping pushes the uncovered counts
      // up, particularly on switch `default:` cases that v3 would ignore.
      thresholds: {
        lines: -70,
        branches: -65,
      },
      exclude: [
        '**/*.test.ts',
        'src/**/index.ts',
        'src/env.d.ts',
        'src/scripts/*.ts',
        'src/tabulation/mock_tally_report_results.ts',
      ],
    },
  },
});
