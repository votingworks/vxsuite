import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 100,
        branches: -1,
      },
    },
  },
});
