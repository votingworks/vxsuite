import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.exercise.ts'],
    coverage: {
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
