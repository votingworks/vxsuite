import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.exercise.ts'],
    coverage: {
      thresholds: {
        lines: -1,
        branches: -1,
      },
    },
  },
});
