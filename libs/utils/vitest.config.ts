import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: -72,
        branches: -54,
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
