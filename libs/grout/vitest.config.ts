import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      thresholds: {
        lines: 100,
        branches: -1,
      },
    },
  },
});
