import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      exclude: ['src/ui_strings/**', 'src/**/index.ts', 'src/**/test_utils.ts'],
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
