import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: -1,
        branches: -6,
      },
    },
  },
});
