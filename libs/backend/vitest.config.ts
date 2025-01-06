import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 98,
        branches: 94,
      },
    },
  },
});
