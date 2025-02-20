import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/cli.ts', 'src/mocks', 'src/**/*.test.ts'],
      thresholds: {
        lines: -1,
        branches: -3,
      },
    },
  },
});
