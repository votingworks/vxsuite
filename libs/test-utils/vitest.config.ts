import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/integration_test_helpers.ts'],
      thresholds: {
        lines: -71,
        branches: -56,
      },
    },
  },
});
