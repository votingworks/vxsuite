import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: -5,
        branches: -3,
      },
    },
  },
});
