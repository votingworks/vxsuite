import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      exclude: ['src/ui_strings/**'],
      thresholds: {
        lines: -25,
        branches: -30,
      },
    },
  },
});
