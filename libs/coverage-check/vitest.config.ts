import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    globalSetup: ['test/global_setup.ts'],
    coverage: {
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
