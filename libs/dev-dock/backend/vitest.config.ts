import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 76,
        branches: 64,
      },
    },
  },
});
