import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.exercise.ts'],
    coverage: {
      // Training exercises — coverage is not meaningful here
      enabled: false,
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
