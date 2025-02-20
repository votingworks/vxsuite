import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: -358,
        branches: -126,
      },
    },
  },
});
