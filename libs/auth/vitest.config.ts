import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: [
        'src/cac/index.ts',
        'src/index.ts',
        'src/integration_test_utils.ts',
        'src/intermediate-scripts',
        'src/jurisdictions.ts',
        'src/test_utils.ts',
      ],
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
