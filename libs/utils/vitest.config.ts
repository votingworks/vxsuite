import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
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
