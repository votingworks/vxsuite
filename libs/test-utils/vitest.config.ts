import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: -38,
        branches: -42,
      },
    },
  },
});
