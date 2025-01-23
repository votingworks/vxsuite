import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
