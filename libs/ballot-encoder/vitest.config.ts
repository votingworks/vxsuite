import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/expect.ts'],
    coverage: {
      thresholds: {
        branches: -2,
        lines: 100,
      },
    },
  },
});
