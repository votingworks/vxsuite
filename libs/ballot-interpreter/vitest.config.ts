import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: -271,
        branches: -133,
      },
    },
  },
});
