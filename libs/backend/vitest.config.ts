import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      exclude: ['src/ui_strings/**'],
      thresholds: {
        lines: -15,
        branches: -31,
      },
    },
  },
});
