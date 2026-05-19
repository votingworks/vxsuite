import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/expect.ts'],
    coverage: {
      thresholds: {
        lines: 99,
        branches: 98,
      },
    },
  },
});
