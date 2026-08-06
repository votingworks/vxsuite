import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      exclude: ['src/index.ts'],
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
