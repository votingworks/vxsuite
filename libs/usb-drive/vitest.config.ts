import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: ['src/cli.ts', 'src/mocks', 'src/**/*.test.ts'],
      thresholds: {
        lines: 99,
        branches: 94,
      },
    },
  },
});
