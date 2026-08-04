import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: ['src/cli.ts', 'src/**/*.test.ts'],
      thresholds: {
        lines: 100,
        branches: 100,
      },
    },
  },
});
