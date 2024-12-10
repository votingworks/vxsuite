import { defineConfig } from '../../vitest.config.shared';

export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 51,
        branches: 47,
      },
    },
  },
});
