import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        branches: -2,
        lines: 100,
      },
    },
  },
});
